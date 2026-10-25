'use server';

// REGISTRO DELLE CONSEGNE AI REPARTI — chi ha ricevuto quale documento.
//
// Il PDF del reparto si genera nel browser e si scarica: la piattaforma non
// invia nulla e, senza un registro, non saprebbe dire se quella comunicazione
// è mai uscita. Qui si annota l'uscita: reparto, data della verifica, versione
// del documento, totali, chi e quando.
//
// E qui si annota anche la seconda metà: chi spedisce il file al reparto lo
// dichiara (data, mezzo, note), e la riga passa da «scaricato» a «inviato». La
// dichiarazione si scrive una volta sola, con il nome di chi l'ha fatta.
//
// PERCHÉ LA SCRITTURA NON CHIEDE UN PERMESSO DI SCRITTURA. Questa riga è il
// diario di un'esportazione, non una modifica ai debiti: chi può leggere il
// triage di un'azienda deve poter scaricare il documento e lasciarne traccia.
// Chiedere SCRITTURA qui vorrebbe dire negare il documento a chi ha il
// permesso di sola lettura, e con esso la sola prova che quel foglio è uscito
// dall'ufficio. Resta comunque la verifica dell'azienda: un operatore vede e
// registra solo le aziende che gli sono assegnate.

import { pool } from '@/lib/db';
import { richiediAccessoAzienda } from '@/lib/autorizzazione';
import { assicuraTabellaConsegneReparti } from '@/db/provision';
import {
  consegnaDaRiga,
  validaConfermaInvio,
  validaConsegna,
  type ConsegnaRegistrata,
} from '@/lib/lavorazioni/consegne';

/** Le colonne che il registro legge: una sola lista, perché RETURNING e SELECT
 * non possano divergere sul nome di un alias. */
const COLONNE_REGISTRO = `id, reparto, tipo,
       to_char(data_verifica, 'YYYY-MM-DD') AS data_verifica,
       versione, nome_file, righe, totale, posizioni_da_contabilizzare,
       importo_da_contabilizzare, consegnato_il, consegnato_da, ragione_sociale,
       to_char(inviata_il, 'YYYY-MM-DD') AS inviata_il, mezzo_invio, note_invio,
       invio_confermato_il, invio_confermato_da`;

/**
 * Tetto alla lettura del registro.
 *
 * La riga più recente per reparto sono dieci-venti righe; il tetto difende il
 * caso in cui un archivio anomalo produca migliaia di destinatari diversi. È
 * un limite di sicurezza, non un conteggio: i reparti oltre il tetto non si
 * vedono, e non si finge di averli visti.
 */
const MASSIMO_REPARTI = 1000;

function schemaValido(nomeSchema: string): boolean {
  return typeof nomeSchema === 'string' && /^[a-z0-9_]+$/.test(nomeSchema);
}

function aziendaValida(aziendaId: number): boolean {
  return Number.isInteger(aziendaId) && aziendaId > 0;
}

export interface EsitoRegistrazioneConsegna {
  success: boolean;
  consegna?: ConsegnaRegistrata;
  error?: string;
}

/**
 * Annota che il documento di un reparto è stato scaricato.
 *
 * Non fa parte della generazione del PDF e non può impedirla: l'azione viene
 * chiamata DOPO che il file è stato salvato, e un errore qui lascia il
 * documento dov'è — al massimo il registro non sa che è uscito.
 */
export async function registraConsegnaRepartoAction(
  nomeSchema: string,
  aziendaId: number,
  input: unknown
): Promise<EsitoRegistrazioneConsegna> {
  try {
    const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaValido(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!aziendaValida(aziendaId)) return { success: false, error: 'Azienda non valida.' };

    const validato = validaConsegna(input);
    if (!validato.ok) return { success: false, error: validato.errore };
    const dati = validato.dati;

    await assicuraTabellaConsegneReparti(nomeSchema);
    const r = await pool.query(
      // La ragione sociale è letta dal database, non dal browser: è una
      // fotografia dell'anagrafica al momento della consegna e deve dire
      // quello che dice la piattaforma, non quello che le è stato inviato.
      `INSERT INTO "${nomeSchema}".consegne_reparti
         (azienda_id, ragione_sociale, reparto, tipo, data_verifica, versione, nome_file, righe,
          totale, posizioni_da_contabilizzare, importo_da_contabilizzare, consegnato_da)
       VALUES ($1, (SELECT ragione_sociale FROM "${nomeSchema}".aziende WHERE id = $1),
               $2, $11, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${COLONNE_REGISTRO}`,
      [
        aziendaId,
        dati.reparto,
        dati.dataVerifica,
        dati.versione,
        dati.nomeFile,
        dati.righe,
        dati.totale,
        dati.posizioniDaContabilizzare,
        dati.importoDaContabilizzare,
        contesto.modalita === 'SALVAGENTE' ? 'Superadmin (ispezione)' : (contesto.email ?? null),
        dati.tipo ?? 'reparto',
      ]
    );
    return { success: true, consegna: consegnaDaRiga(r.rows[0]) };
  } catch (error: unknown) {
    console.error('[registraConsegnaRepartoAction] Errore:', error);
    return {
      success: false,
      error: `Consegna non registrata: ${(error as Error).message || error}`,
    };
  }
}

export interface EsitoRegistroConsegne {
  success: boolean;
  /** Le righe del registro, dalla più recente. Il riepilogo per reparto si
   * calcola nel client (`riassumiConsegne`): così registrare uno scaricamento
   * appena fatto non chiede di rileggere il database. */
  consegne: ConsegnaRegistrata[];
  error?: string;
}

/**
 * L'ultima consegna per reparto, con quante volte il documento è uscito.
 * Serve alla scheda del triage per dire, accanto a ogni PDF, se e quando quel
 * reparto ha già ricevuto il documento — e se la versione è ancora la stessa.
 */
export async function ottieniConsegneRepartiAction(
  nomeSchema: string,
  aziendaId: number
): Promise<EsitoRegistroConsegne> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaValido(nomeSchema)) {
      return { success: false, consegne: [], error: 'Nome schema non valido.' };
    }
    if (!aziendaValida(aziendaId)) {
      return { success: false, consegne: [], error: 'Azienda non valida.' };
    }
    await assicuraTabellaConsegneReparti(nomeSchema);
    const r = await pool.query(
      // L'ULTIMA CONSEGNA PER REPARTO, non tutto il diario. `riassumiConsegne`
      // ne tiene una riga per reparto: scaricare ogni evento di un'azienda
      // seguita per mesi significava trasferire migliaia di righe per mostrarne
      // dieci, a ogni cambio di fase della scheda.
      //
      // `DISTINCT ON` prende la più recente di ogni reparto (nome senza
      // maiuscole, come il raggruppamento nel client) e la finestra conta gli
      // scaricamenti veri, così il numero mostrato non è «1» per costruzione.
      //
      // to_char: la colonna è DATE, e il driver la rende come Date a mezzanotte
      // (locale con `pg`, UTC con PGlite in portable). Passare da Date sposterebbe
      // il giorno a seconda del fuso e del driver; come testo è sempre il giorno
      // scritto nel database. Vale per data_verifica e per inviata_il.
      `SELECT DISTINCT ON (tipo, lower(reparto)) *
         FROM (
           SELECT ${COLONNE_REGISTRO},
                  count(*) OVER (PARTITION BY tipo, lower(reparto)) AS scaricamenti
             FROM "${nomeSchema}".consegne_reparti
            WHERE azienda_id = $1
         ) AS registro
        ORDER BY tipo, lower(reparto), consegnato_il DESC, id DESC
        LIMIT ${MASSIMO_REPARTI}`,
      [aziendaId]
    );
    return { success: true, consegne: r.rows.map(consegnaDaRiga) };
  } catch (error: unknown) {
    console.error('[ottieniConsegneRepartiAction] Errore:', error);
    return {
      success: false,
      consegne: [],
      error: `Registro non leggibile: ${(error as Error).message || error}`,
    };
  }
}

export interface EsitoConfermaInvio {
  success: boolean;
  /** La riga aggiornata: il client la sostituisce nel registro che ha già in
   * memoria, senza rileggere tutte le consegne dell'azienda. */
  consegna?: ConsegnaRegistrata;
  error?: string;
}

/**
 * Dichiara che il documento di una consegna è stato spedito al reparto.
 *
 * La consegna è già avvenuta — è la riga scaricata — e qui si aggiunge la
 * dichiarazione d'invio: data, mezzo, note, più chi la firma e quando. Il PDF
 * non viene toccato e il documento non viene reinviato: la piattaforma non ha
 * un canale verso il reparto, e questa azione non lo inventa.
 *
 * SCRITTA UNA VOLTA. L'UPDATE si porta la condizione
 * `invio_confermato_il IS NULL`: due clic, o due schede aperte, non
 * sovrascrivono la prima dichiarazione — chi ha detto di aver spedito il
 * 21/10 via PEC non si trova corretto a sua insaputa da chi arriva dopo. Se
 * la conferma c'è già, l'azione lo dice invece di fingere di aver scritto.
 *
 * L'id della consegna arriva dal browser: deve appartenere all'azienda
 * dell'URL e a nessun'altra (`WHERE id = $1 AND azienda_id = $2`), altrimenti
 * si confermerebbe l'invio di un documento che non si è nemmeno visto.
 */
export async function confermaInvioConsegnaAction(
  nomeSchema: string,
  aziendaId: number,
  consegnaId: number,
  input: unknown
): Promise<EsitoConfermaInvio> {
  try {
    const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaValido(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!aziendaValida(aziendaId)) return { success: false, error: 'Azienda non valida.' };
    if (!Number.isInteger(consegnaId) || consegnaId <= 0) {
      return { success: false, error: 'Consegna non valida.' };
    }

    const validato = validaConfermaInvio(input);
    if (!validato.ok) return { success: false, error: validato.errore };
    const dati = validato.dati;

    await assicuraTabellaConsegneReparti(nomeSchema);
    const r = await pool.query(
      `UPDATE "${nomeSchema}".consegne_reparti
          SET inviata_il = $1, mezzo_invio = $2, note_invio = $3,
              invio_confermato_il = now(), invio_confermato_da = $4
        WHERE id = $5 AND azienda_id = $6 AND invio_confermato_il IS NULL
        RETURNING ${COLONNE_REGISTRO}`,
      [
        dati.inviataIl,
        dati.mezzo,
        dati.note,
        contesto.modalita === 'SALVAGENTE' ? 'Superadmin (ispezione)' : (contesto.email ?? null),
        consegnaId,
        aziendaId,
      ]
    );

    // Nessuna riga restituita da un UPDATE ... RETURNING = nessuna riga
    // aggiornata. Si guarda `rows` e non `rowCount`: PGlite (portable) conta le
    // righe toccate in `affectedRows`, `pg` in `rowCount`, e `rows` è l'unico
    // campo che i due driver chiamano allo stesso modo.
    if (r.rows.length === 0) {
      // O la consegna non esiste per questa azienda, o l'invio era già stato
      // confermato. Le due cose vanno dette diverse — la prima è un errore, la
      // seconda è uno stato normale.
      const esistente = await pool.query(
        `SELECT invio_confermato_il FROM "${nomeSchema}".consegne_reparti
          WHERE id = $1 AND azienda_id = $2`,
        [consegnaId, aziendaId]
      );
      if (esistente.rows.length === 0) {
        return { success: false, error: 'Consegna non trovata per questa azienda.' };
      }
      return {
        success: false,
        error:
          'L’invio di questa consegna è già stato confermato: il registro conserva la prima dichiarazione.',
      };
    }

    return { success: true, consegna: consegnaDaRiga(r.rows[0]) };
  } catch (error: unknown) {
    console.error('[confermaInvioConsegnaAction] Errore:', error);
    return {
      success: false,
      error: `Conferma non registrata: ${(error as Error).message || error}`,
    };
  }
}
