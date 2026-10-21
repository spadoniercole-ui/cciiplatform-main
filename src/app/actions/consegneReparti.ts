'use server';

// REGISTRO DELLE CONSEGNE AI REPARTI — chi ha ricevuto quale documento.
//
// Il PDF del reparto si genera nel browser e si scarica: la piattaforma non
// invia nulla e, senza un registro, non saprebbe dire se quella comunicazione
// è mai uscita. Qui si annota l'uscita: reparto, data della verifica, versione
// del documento, totali, chi e quando.
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
  validaConsegna,
  type ConsegnaRegistrata,
} from '@/lib/lavorazioni/consegne';

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
      `INSERT INTO "${nomeSchema}".consegne_reparti
         (azienda_id, reparto, data_verifica, versione, nome_file, righe,
          totale, posizioni_da_contabilizzare, importo_da_contabilizzare, consegnato_da)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, reparto, to_char(data_verifica, 'YYYY-MM-DD') AS data_verifica,
                 versione, nome_file, righe, totale, posizioni_da_contabilizzare,
                 importo_da_contabilizzare, consegnato_il, consegnato_da`,
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
      // to_char: la colonna è DATE, e il driver la rende come Date a mezzanotte
      // (locale con `pg`, UTC con PGlite in portable). Passare da Date sposterebbe
      // il giorno a seconda del fuso e del driver; come testo è sempre il giorno
      // scritto nel database.
      `SELECT id, reparto, to_char(data_verifica, 'YYYY-MM-DD') AS data_verifica,
              versione, nome_file, righe, totale, posizioni_da_contabilizzare,
              importo_da_contabilizzare, consegnato_il, consegnato_da
       FROM "${nomeSchema}".consegne_reparti
       WHERE azienda_id = $1
       ORDER BY consegnato_il DESC, id DESC`,
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
