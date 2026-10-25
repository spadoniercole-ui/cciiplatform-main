'use server';

// Ciclo di vita di una "azienda in verifica".
//
// Il triage viene prima dell'istruttoria: si guarda una posizione, si ottiene
// l'indicatore, e SOLO se si decide di procedere quella posizione diventa
// una pratica vera. Ma la verifica lascia comunque traccia, perché decidere
// di non procedere è a sua volta una decisione amministrativa.

import { apriNuovoCiclo, elencaCicli, type CicloArchiviato } from '@/lib/cicloAzienda';
import { pool } from '@/lib/db';
import { assicuraTabellaAziende } from '@/db/provision';
import type { AnagraficaEstratta } from '@/app/actions/visuraEstrazione';
import { richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';

export interface RisultatoVerifica {
  success: boolean;
  aziendaId?: number;
  /** L'azienda era già nota e il lavoro precedente è stato archiviato: si riparte da zero. */
  cicloArchiviato?: boolean;
  error?: string;
}

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

/**
 * Crea (o aggiorna) l'azienda in stato di verifica.
 *
 * I dati arrivano dalla visura ma sono già passati per la conferma
 * dell'operatore: qui si scrive ciò che ha confermato, non ciò che il
 * modello ha proposto.
 */
export async function creaAziendaInVerificaAction(
  nomeSchema: string,
  dati: AnagraficaEstratta
): Promise<RisultatoVerifica> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!dati.ragioneSociale || dati.ragioneSociale.trim() === '') {
      return { success: false, error: 'La ragione sociale è obbligatoria.' };
    }
    await assicuraTabellaAziende(nomeSchema);

    // Se la stessa impresa è già presente (per P.IVA o codice fiscale) non se
    // ne crea una seconda: si riusa quella, altrimenti due verifiche sullo
    // stesso soggetto produrrebbero due posizioni scollegate.
    const esistente = await pool.query(
      `SELECT id, in_verifica FROM "${nomeSchema}".aziende
        WHERE (partita_iva IS NOT NULL AND partita_iva = $1)
           OR (codice_fiscale IS NOT NULL AND codice_fiscale = $2)
        LIMIT 1`,
      [dati.partitaIva, dati.codiceFiscale]
    );

    if (esistente.rows.length > 0) {
      const id = Number(esistente.rows[0].id);
      // Si RIEMPIONO i campi ancora vuoti con quelli appena confermati, ma
      // non si sovrascrive nulla di già valorizzato: una verifica di triage
      // non deve poter modificare l'anagrafica di una posizione in
      // lavorazione, dove quei dati sono stati controllati da qualcuno.
      //
      // Prima si aggiornava solo la data, e il risultato era che rifacendo
      // una verifica su un'azienda già vista i dati letti dalla visura —
      // l'anno di costituzione fra tutti — venivano mostrati a schermo,
      // confermati dall'operatore, e poi silenziosamente buttati via:
      // l'indicatore continuava a dichiararli mancanti.
      await pool.query(
        `UPDATE "${nomeSchema}".aziende SET
           ragione_sociale = COALESCE(NULLIF(ragione_sociale, ''), $2),
           forma_giuridica = COALESCE(forma_giuridica, $3),
           codice_fiscale = COALESCE(codice_fiscale, $4),
           partita_iva = COALESCE(partita_iva, $5),
           codice_ateco = COALESCE(codice_ateco, $6),
           numero_rea = COALESCE(numero_rea, $7),
           capitale_sociale = COALESCE(capitale_sociale, $8),
           indirizzo_sede_legale = COALESCE(indirizzo_sede_legale, $9),
           citta = COALESCE(citta, $10),
           provincia = COALESCE(provincia, $11),
           cap = COALESCE(cap, $12),
           rappresentante_legale = COALESCE(rappresentante_legale, $13),
           ruolo_rappresentante_legale = COALESCE(ruolo_rappresentante_legale, $14),
           pec = COALESCE(pec, $15),
           anno_costituzione = COALESCE(anno_costituzione, $16),
           verifica_eseguita_il = now()
         WHERE id = $1`,
        [
          id,
          dati.ragioneSociale.trim(),
          dati.formaGiuridica,
          dati.codiceFiscale,
          dati.partitaIva,
          dati.codiceAteco,
          dati.numeroRea,
          dati.capitaleSociale,
          dati.indirizzoSedeLegale,
          dati.citta,
          dati.provincia,
          dati.cap,
          dati.rappresentanteLegale,
          dati.ruoloRappresentanteLegale,
          dati.pec,
          dati.annoCostituzione,
        ]
      );
      // Nuovo triage = nuova istruttoria: il lavoro precedente (screening,
      // check list, posizioni, soglie) va in archivio e si riparte da zero.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const esito = await apriNuovoCiclo(
          async (sql, params) => (await client.query(sql, params)).rows,
          nomeSchema,
          id
        );
        await client.query('COMMIT');
        return { success: true, aziendaId: id, cicloArchiviato: esito.archiviato };
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    }

    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".aziende
         (ragione_sociale, forma_giuridica, codice_fiscale, partita_iva, codice_ateco,
          numero_rea, capitale_sociale, indirizzo_sede_legale, citta, provincia, cap,
          rappresentante_legale, ruolo_rappresentante_legale, pec, anno_costituzione,
          in_verifica, verifica_eseguita_il)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, TRUE, now())
       RETURNING id`,
      [
        dati.ragioneSociale.trim(),
        dati.formaGiuridica,
        dati.codiceFiscale,
        dati.partitaIva,
        dati.codiceAteco,
        dati.numeroRea,
        dati.capitaleSociale,
        dati.indirizzoSedeLegale,
        dati.citta,
        dati.provincia,
        dati.cap,
        dati.rappresentanteLegale,
        dati.ruoloRappresentanteLegale,
        dati.pec,
        dati.annoCostituzione,
      ]
    );
    return { success: true, aziendaId: Number(r.rows[0].id) };
  } catch (error: unknown) {
    console.error('[creaAziendaInVerificaAction] Errore:', error);
    return { success: false, error: `Creazione non riuscita: ${(error as Error).message}` };
  }
}

/**
 * Archivia la verifica con il motivo della decisione.
 *
 * Decidere di NON procedere è una decisione amministrativa quanto decidere
 * di procedere. Senza registrarla, la coda di lavoro cresce all'infinito e
 * fra sei mesi nessuno sa perché quella posizione è stata lasciata andare —
 * né che qualcuno l'aveva guardata.
 */
export async function archiviaVerificaAction(
  nomeSchema: string,
  aziendaId: number,
  motivo: string
): Promise<RisultatoVerifica> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!motivo || motivo.trim().length < 3) {
      // Il motivo è obbligatorio: un'archiviazione senza spiegazione è
      // indistinguibile da una dimenticanza.
      return { success: false, error: 'Indicare il motivo della decisione.' };
    }
    await pool.query(
      `UPDATE "${nomeSchema}".aziende
          SET verifica_archiviata = TRUE, verifica_motivo = $2, verifica_eseguita_il = now()
        WHERE id = $1`,
      [aziendaId, motivo.trim()]
    );
    return { success: true, aziendaId };
  } catch (error: unknown) {
    console.error('[archiviaVerificaAction] Errore:', error);
    return { success: false, error: `Archiviazione non riuscita: ${(error as Error).message}` };
  }
}

/**
 * Registra l'esito della verifica, senza promuovere la posizione.
 *
 * Con l'esito si conserva la DATA DI RIFERIMENTO della verifica (il giorno a
 * cui si riferiscono i conti). È l'unico dato del triage che il database non
 * aveva: senza, riaprendo una verifica dopo un'interruzione i documenti per i
 * reparti si ricostruirebbero su una data diversa da quella dichiarata, e la
 * loro impronta di versione cambierebbe senza che nulla sia cambiato.
 */
export async function registraEsitoVerificaAction(
  nomeSchema: string,
  aziendaId: number,
  esito: string,
  dataRiferimento?: string
): Promise<RisultatoVerifica> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const giorno =
      typeof dataRiferimento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataRiferimento.trim())
        ? dataRiferimento.trim()
        : null;
    await pool.query(
      `UPDATE "${nomeSchema}".aziende
          SET verifica_esito = $2,
              verifica_eseguita_il = now(),
              verifica_riferita_al = COALESCE($3::date, verifica_riferita_al)
        WHERE id = $1`,
      [aziendaId, esito, giorno]
    );
    return { success: true, aziendaId };
  } catch (error: unknown) {
    console.error('[registraEsitoVerificaAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

/**
 * Promuove la verifica a posizione in lavorazione.
 *
 * Da qui in poi l'azienda compare nell'elenco Aziende e può ospitare
 * scenari: è il momento in cui il funzionario decide che la posizione va
 * seguita.
 */
export async function promuoviAziendaAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoVerifica> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(`UPDATE "${nomeSchema}".aziende SET in_verifica = FALSE WHERE id = $1`, [
      aziendaId,
    ]);
    return { success: true, aziendaId };
  } catch (error: unknown) {
    console.error('[promuoviAziendaAction] Errore:', error);
    return { success: false, error: `Promozione non riuscita: ${(error as Error).message}` };
  }
}

/**
 * La verifica già eseguita, come serve per RIAPRIRLA.
 *
 * Il triage viveva soltanto nella scheda del browser: chiusa quella — per una
 * ricarica, un crash, uno sbalzo di tensione — le comunicazioni preparate e i
 * documenti per i reparti non erano più raggiungibili, e la videata in cui si
 * decide se procedere con l'azienda non esisteva più. I dati però c'erano già:
 * l'azienda con l'esito, le posizioni del V.E.R.A., i valori delle soglie. Qui
 * si restituisce quello che serve a ricomporre la videata, e nient'altro: le
 * lavorazioni e i destinatari si rileggono dalle loro configurazioni, perché
 * una verifica riaperta oggi deve usare le regole di oggi.
 *
 * La data di riferimento è quella dichiarata al momento della verifica. Per le
 * verifiche eseguite prima che la colonna esistesse si usa il giorno in cui
 * sono state eseguite: è un'approssimazione dichiarata, non una data scelta a
 * caso — l'unica alternativa era rifiutare di riaprirle.
 */
export interface VerificaDaRiprendere {
  aziendaId: number;
  anagrafica: AnagraficaEstratta;
  /** AAAA-MM-GG: il giorno a cui si riferiscono i conti. */
  dataVerifica: string;
  /** true quando la data viene da `verifica_eseguita_il` e non da una dichiarazione. */
  dataApprossimata: boolean;
  esito: string | null;
  eseguitaIl: string | null;
  inVerifica: boolean;
  archiviata: boolean;
  motivo: string | null;
}

export async function ottieniVerificaDaRiprendereAction(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; verifica?: VerificaDaRiprendere; error?: string }> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, error: 'Azienda non valida.' };
    }
    const r = await pool.query(
      // to_char: la colonna è DATE e i due driver la rendono come Date con fusi
      // diversi (locale con `pg`, UTC con PGlite): passare da Date sposterebbe
      // il giorno a seconda di chi guarda.
      `SELECT ragione_sociale, forma_giuridica, codice_fiscale, partita_iva, codice_ateco,
              numero_rea, capitale_sociale, indirizzo_sede_legale, citta, provincia, cap,
              rappresentante_legale, ruolo_rappresentante_legale, pec, anno_costituzione,
              verifica_esito, in_verifica, verifica_archiviata, verifica_motivo,
              to_char(verifica_riferita_al, 'YYYY-MM-DD') AS verifica_riferita_al,
              to_char(verifica_eseguita_il, 'YYYY-MM-DD') AS verifica_eseguita_giorno,
              verifica_eseguita_il
         FROM "${nomeSchema}".aziende
        WHERE id = $1`,
      [aziendaId]
    );
    const a = r.rows[0];
    if (!a) return { success: false, error: 'Azienda non trovata.' };

    const dichiarata = a.verifica_riferita_al ? String(a.verifica_riferita_al) : '';
    const approssimata = a.verifica_eseguita_giorno ? String(a.verifica_eseguita_giorno) : '';
    const oggi = new Date().toISOString().slice(0, 10);
    const testo = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
    const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

    return {
      success: true,
      verifica: {
        aziendaId,
        anagrafica: {
          ragioneSociale: testo(a.ragione_sociale),
          formaGiuridica: testo(a.forma_giuridica),
          codiceFiscale: testo(a.codice_fiscale),
          partitaIva: testo(a.partita_iva),
          codiceAteco: testo(a.codice_ateco),
          numeroRea: testo(a.numero_rea),
          capitaleSociale: numero(a.capitale_sociale),
          indirizzoSedeLegale: testo(a.indirizzo_sede_legale),
          citta: testo(a.citta),
          provincia: testo(a.provincia),
          cap: testo(a.cap),
          rappresentanteLegale: testo(a.rappresentante_legale),
          ruoloRappresentanteLegale: testo(a.ruolo_rappresentante_legale),
          pec: testo(a.pec),
          annoCostituzione: numero(a.anno_costituzione),
        },
        dataVerifica: dichiarata || approssimata || oggi,
        // Vero ogni volta che la data non è stata DICHIARATA: anche quando c'è
        // il giorno dell'esecuzione, è un'approssimazione, e la scheda lo dice.
        dataApprossimata: !dichiarata,
        esito: testo(a.verifica_esito),
        eseguitaIl: a.verifica_eseguita_il
          ? new Date(a.verifica_eseguita_il as string).toISOString()
          : null,
        inVerifica: Boolean(a.in_verifica),
        archiviata: Boolean(a.verifica_archiviata),
        motivo: testo(a.verifica_motivo),
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniVerificaDaRiprendereAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export interface RigaVerifica {
  id: number;
  ragioneSociale: string;
  partitaIva: string | null;
  esito: string | null;
  eseguitaIl: string | null;
}

/**
 * Storico delle verifiche: TUTTE, comprese quelle già promosse.
 *
 * Il pannello di dashboard mostra solo le posizioni in sospeso — è una coda
 * di lavoro. Ma la schermata di triage promette che "la verifica resta
 * consultabile", e finora quella promessa non era mantenuta: esito e data
 * erano nel database e non esistevano per l'utente.
 */
export async function ottieniStoricoVerificheAction(nomeSchema: string): Promise<{
  success: boolean;
  righe?: (RigaVerifica & {
    presaInCarico: boolean;
    archiviata: boolean;
    motivo: string | null;
  })[];
  error?: string;
}> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const r = await pool
      .query(
        `SELECT id, ragione_sociale, partita_iva, verifica_esito, verifica_eseguita_il,
                in_verifica, verifica_archiviata, verifica_motivo
           FROM "${nomeSchema}".aziende
          WHERE verifica_eseguita_il IS NOT NULL
          ORDER BY verifica_eseguita_il DESC`
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    // Operatori: solo le aziende assegnate dall'Admin di Spazio.
    const righe =
      contesto.modalita === 'OPERATORE'
        ? r.rows.filter((x) => contesto.aziendeConsentite?.includes(Number(x.id)))
        : r.rows;
    return {
      success: true,
      righe: righe.map((x) => ({
        id: Number(x.id),
        ragioneSociale: String(x.ragione_sociale),
        partitaIva: x.partita_iva ? String(x.partita_iva) : null,
        esito: x.verifica_esito ? String(x.verifica_esito) : null,
        eseguitaIl: x.verifica_eseguita_il
          ? new Date(x.verifica_eseguita_il as string).toISOString()
          : null,
        presaInCarico: !x.in_verifica,
        archiviata: Boolean(x.verifica_archiviata),
        motivo: x.verifica_motivo ? String(x.verifica_motivo) : null,
      })),
    };
  } catch (error: unknown) {
    console.error('[ottieniStoricoVerificheAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

/** Cicli di istruttoria archiviati di un'azienda (sola lettura). */
export async function elencaCicliAziendaAction(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; cicli?: CicloArchiviato[]; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const cicli = await elencaCicli(
      async (sql, params) => (await pool.query(sql, params)).rows,
      nomeSchema,
      aziendaId
    );
    return { success: true, cicli };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Lettura dell'archivio non riuscita: ${(error as Error).message}`,
    };
  }
}
