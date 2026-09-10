'use server';

// Ciclo di vita di una "azienda in verifica".
//
// Il triage viene prima dell'istruttoria: si guarda una posizione, si ottiene
// l'indicatore, e SOLO se si decide di procedere quella posizione diventa
// una pratica vera. Ma la verifica lascia comunque traccia, perché decidere
// di non procedere è a sua volta una decisione amministrativa.

import { pool } from '@/lib/db';
import { assicuraTabellaAziende } from '@/db/provision';
import type { AnagraficaEstratta } from '@/app/actions/visuraEstrazione';

export interface RisultatoVerifica {
  success: boolean;
  aziendaId?: number;
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
      await pool.query(
        `UPDATE "${nomeSchema}".aziende
            SET verifica_eseguita_il = now()
          WHERE id = $1`,
        [id]
      );
      return { success: true, aziendaId: id };
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

/** Registra l'esito della verifica, senza promuovere la posizione. */
export async function registraEsitoVerificaAction(
  nomeSchema: string,
  aziendaId: number,
  esito: string
): Promise<RisultatoVerifica> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(
      `UPDATE "${nomeSchema}".aziende SET verifica_esito = $2, verifica_eseguita_il = now() WHERE id = $1`,
      [aziendaId, esito]
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

export interface RigaVerifica {
  id: number;
  ragioneSociale: string;
  partitaIva: string | null;
  esito: string | null;
  eseguitaIl: string | null;
}

export async function ottieniAziendeInVerificaAction(
  nomeSchema: string
): Promise<{ success: boolean; righe?: RigaVerifica[]; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const r = await pool
      .query(
        `SELECT id, ragione_sociale, partita_iva, verifica_esito, verifica_eseguita_il
           FROM "${nomeSchema}".aziende
          WHERE in_verifica = TRUE
          ORDER BY verifica_eseguita_il DESC NULLS LAST`
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    return {
      success: true,
      righe: r.rows.map((x) => ({
        id: Number(x.id),
        ragioneSociale: String(x.ragione_sociale),
        partitaIva: x.partita_iva ? String(x.partita_iva) : null,
        esito: x.verifica_esito ? String(x.verifica_esito) : null,
        eseguitaIl: x.verifica_eseguita_il
          ? new Date(x.verifica_eseguita_il as string).toISOString()
          : null,
      })),
    };
  } catch (error: unknown) {
    console.error('[ottieniAziendeInVerificaAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}
