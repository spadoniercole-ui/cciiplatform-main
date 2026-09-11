'use server';

// Posizione Debitoria dell'Ente — a livello di AZIENDA, non di
// scenario: quello che l'ente dichiara di avere a credito verso
// un'azienda secondo la propria contabilità non cambia da una
// proposta all'altra della stessa azienda. Stesso sistema di
// caricamento della Proposta (stessa UI, stesso export/import Excel),
// ma dati e tabella diversi.

import { pool } from '@/lib/db';
import { assicuraTabellaDebitiEnte } from '@/db/provision';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface RigaDebitoEnte {
  id: number;
  aziendaId: number;
  voce: string;
  importo: number;
  /** Opzionale — solo se lo schema del file distingue debito originario da quanto già pagato. null = nessuna distinzione, il saldo coincide con l'importo. */
  importoVersato: number | null;
  /** Codice categoria (parametrico): DEBITO/AVA/NEUTRO o un legacy CLE/CEN/CEC/CEA. */
  tipo: string;
  note: string | null;
  /** Opzionale — generica (scadenza, notifica, emissione: il significato lo sa chi ha configurato il tracciato). */
  data: string | null;
  /** Colonne extra mappate dall'operatore (chiave = intestazione originale del file). null/vuoto se nessuna. */
  datiExtra: Record<string, string> | null;
  /** Tracciato d'origine della riga (catalogo). null = riga legacy/manuale. */
  tracciatoId: number | null;
  /** Codice-guida grezzo da cui è stata derivata la categoria. null se manuale o tipo fisso. */
  codiceGuida: string | null;
}

export interface DatiRigaDebitoEnte {
  voce: string;
  importo: number;
  importoVersato: number | null;
  tipo: string;
  note: string | null;
  data: string | null;
  /** Colonne extra (chiave = intestazione originale). Opzionale: l'inserimento manuale non ne ha. */
  datiExtra?: Record<string, string> | null;
  /** Tracciato d'origine (import). Assente per l'inserimento manuale. */
  tracciatoId?: number | null;
  /** Codice-guida grezzo (per la ri-applicazione delle correzioni). Assente per l'inserimento manuale/tipo fisso. */
  codiceGuida?: string | null;
}

export interface RisultatoElencoDebitiEnte {
  success: boolean;
  righe: RigaDebitoEnte[];
  error?: string;
}

/**
 * @param scenarioId righe di QUELLO scenario. Omesso = righe non ancora
 *        attribuite a uno scenario, cioè la posizione caricata a livello
 *        azienda prima che la Situazione Debitoria si spostasse nello
 *        scenario. Restano leggibili e riprendibili, non si perdono.
 */
export async function ottieniDebitiEnte(
  nomeSchema: string,
  aziendaId: number,
  scenarioId?: number
): Promise<RisultatoElencoDebitiEnte> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, righe: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaDebitiEnte(nomeSchema);

    const risultato = await pool.query(
      `SELECT id, azienda_id, voce, importo, importo_versato, tipo, note, data, dati_extra, tracciato_id, codice_guida
       FROM "${nomeSchema}".debiti_ente
       WHERE azienda_id = $1
         AND ${scenarioId === undefined ? 'scenario_id IS NULL' : 'scenario_id = $2'}
       ORDER BY id ASC`,
      scenarioId === undefined ? [aziendaId] : [aziendaId, scenarioId]
    );

    return {
      success: true,
      righe: risultato.rows.map((r) => ({
        id: r.id,
        aziendaId: r.azienda_id,
        voce: r.voce,
        importo: Number(r.importo),
        importoVersato: r.importo_versato === null ? null : Number(r.importo_versato),
        tipo: r.tipo as string,
        note: r.note,
        data: r.data ? new Date(r.data).toISOString().slice(0, 10) : null,
        datiExtra:
          r.dati_extra && typeof r.dati_extra === 'object' && Object.keys(r.dati_extra).length > 0
            ? (r.dati_extra as Record<string, string>)
            : null,
        tracciatoId:
          r.tracciato_id === null || r.tracciato_id === undefined ? null : Number(r.tracciato_id),
        codiceGuida: r.codice_guida ?? null,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniDebitiEnte] Errore:', error);
    return {
      success: false,
      righe: [],
      error: `Impossibile caricare la posizione debitoria: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneDebitoEnte {
  success: boolean;
  error?: string;
}

export async function aggiungiRigaDebitoEnteAction(
  nomeSchema: string,
  aziendaId: number,
  dati: DatiRigaDebitoEnte,
  scenarioId?: number
): Promise<RisultatoOperazioneDebitoEnte> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!dati.voce.trim()) {
      return { success: false, error: 'La voce di debito è obbligatoria.' };
    }
    if (dati.importo < 0) {
      return { success: false, error: "L'importo non può essere negativo." };
    }
    await assicuraTabellaDebitiEnte(nomeSchema);
    const datiExtra =
      dati.datiExtra && Object.keys(dati.datiExtra).length > 0
        ? JSON.stringify(dati.datiExtra)
        : null;
    await pool.query(
      `INSERT INTO "${nomeSchema}".debiti_ente (azienda_id, scenario_id, voce, importo, importo_versato, tipo, note, data, dati_extra, tracciato_id, codice_guida)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        aziendaId,
        scenarioId ?? null,
        dati.voce.trim(),
        dati.importo,
        dati.importoVersato,
        dati.tipo,
        dati.note,
        dati.data,
        datiExtra,
        dati.tracciatoId ?? null,
        dati.codiceGuida ?? null,
      ]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiungiRigaDebitoEnteAction] Errore:', error);
    return { success: false, error: `Impossibile aggiungere la riga: ${error.message || error}` };
  }
}

export async function modificaRigaDebitoEnteAction(
  nomeSchema: string,
  id: number,
  dati: DatiRigaDebitoEnte
): Promise<RisultatoOperazioneDebitoEnte> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!dati.voce.trim()) {
      return { success: false, error: 'La voce di debito è obbligatoria.' };
    }
    await pool.query(
      `UPDATE "${nomeSchema}".debiti_ente SET voce = $2, importo = $3, importo_versato = $4, tipo = $5, note = $6, data = $7 WHERE id = $1`,
      [id, dati.voce.trim(), dati.importo, dati.importoVersato, dati.tipo, dati.note, dati.data]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[modificaRigaDebitoEnteAction] Errore:', error);
    return { success: false, error: `Impossibile modificare la riga: ${error.message || error}` };
  }
}

export async function eliminaRigaDebitoEnteAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneDebitoEnte> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_ente WHERE id = $1`, [id]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaRigaDebitoEnteAction] Errore:', error);
    return { success: false, error: `Impossibile eliminare la riga: ${error.message || error}` };
  }
}

/**
 * Elimina le righe di un'azienda provenienti da UN SOLO tracciato — usata
 * prima di reimportare quello stesso tracciato: sostituzione per-tracciato,
 * così ricaricare l'nrc non tocca le righe del DettaglioRichiesta. Le righe
 * manuali/legacy (tracciato_id NULL) non vengono toccate.
 */
export async function eliminaDebitiPerTracciatoAzienda(
  nomeSchema: string,
  aziendaId: number,
  tracciatoId: number
): Promise<RisultatoOperazioneDebitoEnte> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(
      `DELETE FROM "${nomeSchema}".debiti_ente WHERE azienda_id = $1 AND tracciato_id = $2`,
      [aziendaId, tracciatoId]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaDebitiPerTracciatoAzienda] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare le righe del tracciato: ${error.message || error}`,
    };
  }
}

/** Elimina TUTTE le righe di un'azienda — usata prima di un reimport Excel, stesso principio già in uso per la Proposta. */
/**
 * Copia nello scenario le righe non ancora attribuite — la posizione
 * caricata a livello azienda prima che la Situazione Debitoria si
 * spostasse nello scenario.
 *
 * COPIA, non sposta: le righe originali restano dove sono, così un secondo
 * scenario sulla stessa azienda può riprenderle a sua volta e nessuno perde
 * il riferimento. È anche ciò che rende l'operazione ripetibile senza
 * conseguenze se qualcuno la lancia due volte per errore — la seconda volta
 * non trova nulla da fare, perché lo scenario ha già le sue righe.
 */
export async function riprendiDebitiAziendaInScenarioAction(
  nomeSchema: string,
  aziendaId: number,
  scenarioId: number
): Promise<{ success: boolean; copiate?: number; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaDebitiEnte(nomeSchema);

    const gia = await pool.query(
      `SELECT count(*)::int AS n FROM "${nomeSchema}".debiti_ente WHERE scenario_id = $1`,
      [scenarioId]
    );
    if (Number(gia.rows[0]?.n ?? 0) > 0) {
      return {
        success: false,
        error:
          'Lo scenario ha già una propria posizione debitoria: svuotarla prima di riprendere quella dell’azienda.',
      };
    }

    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".debiti_ente
         (azienda_id, scenario_id, voce, importo, importo_versato, tipo, note, data, dati_extra, tracciato_id, codice_guida)
       SELECT azienda_id, $2, voce, importo, importo_versato, tipo, note, data, dati_extra, tracciato_id, codice_guida
         FROM "${nomeSchema}".debiti_ente
        WHERE azienda_id = $1 AND scenario_id IS NULL`,
      [aziendaId, scenarioId]
    );
    return { success: true, copiate: r.rowCount ?? 0 };
  } catch (error: unknown) {
    console.error('[riprendiDebitiAziendaInScenarioAction] Errore:', error);
    return { success: false, error: `Operazione non riuscita: ${(error as Error).message}` };
  }
}

/** Quante righe non attribuite esistono per questa azienda. */
export async function contaDebitiAziendaNonAttribuitiAction(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; righe?: number; totale?: number; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaDebitiEnte(nomeSchema);
    const r = await pool.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(importo), 0) AS tot
         FROM "${nomeSchema}".debiti_ente WHERE azienda_id = $1 AND scenario_id IS NULL`,
      [aziendaId]
    );
    return {
      success: true,
      righe: Number(r.rows[0]?.n ?? 0),
      totale: Number(r.rows[0]?.tot ?? 0),
    };
  } catch (error: unknown) {
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export async function eliminaTuttiDebitiEnteAction(
  nomeSchema: string,
  aziendaId: number,
  scenarioId?: number
): Promise<RisultatoOperazioneDebitoEnte> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    // Si svuota SOLO l'ambito richiesto: svuotare lo scenario non deve
    // toccare la posizione dell'azienda, né quella di un altro scenario.
    await pool.query(
      `DELETE FROM "${nomeSchema}".debiti_ente
        WHERE azienda_id = $1
          AND ${scenarioId === undefined ? 'scenario_id IS NULL' : 'scenario_id = $2'}`,
      scenarioId === undefined ? [aziendaId] : [aziendaId, scenarioId]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaTuttiDebitiEnteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare le righe esistenti: ${error.message || error}`,
    };
  }
}
