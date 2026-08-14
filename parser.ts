'use server';

// Risposte alla Check List, una riga per domanda per scenario PER MODELLO
// (modelloChiave: 'MINISTERIALE' per quella di sempre, altrimenti l'id
// del modello custom in checklist_modelli, come stringa) — uno scenario
// può avere più check list compilate in parallelo (es. la Ministeriale
// più una o più custom di un ente).

import { assicuraTabelleScenari } from '@/db/provision';
import { MODELLO_MINISTERIALE } from '@/lib/checklist/costanti';

export interface RispostaChecklist {
  domandaId: string;
  risposta: boolean | null;
  note: string | null;
}

export interface RisultatoElencoRisposte {
  success: boolean;
  risposte: RispostaChecklist[];
  error?: string;
}

export async function ottieniRisposteChecklist(
  nomeSchema: string,
  scenarioId: number,
  modelloChiave: string = MODELLO_MINISTERIALE
): Promise<RisultatoElencoRisposte> {
  try {
    await assicuraTabelleScenari(nomeSchema);
    const { pool } = await import('@/lib/db');

    const risultato = await pool.query(
      `SELECT domanda_id, risposta, note FROM "${nomeSchema}".checklist_risposte
       WHERE scenario_id = $1 AND modello_chiave = $2`,
      [scenarioId, modelloChiave]
    );

    return {
      success: true,
      risposte: risultato.rows.map((r) => ({
        domandaId: r.domanda_id,
        risposta: r.risposta,
        note: r.note,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniRisposteChecklist] Errore:', error);
    return {
      success: false,
      risposte: [],
      error: `Impossibile caricare le risposte: ${error.message || error}`,
    };
  }
}

export interface RisultatoSalvataggioRisposta {
  success: boolean;
  error?: string;
}

/** Salva (o aggiorna) la risposta a una singola domanda di un modello — upsert su (scenario_id, modello_chiave, domanda_id). */
export async function salvaRispostaChecklistAction(
  nomeSchema: string,
  scenarioId: number,
  modelloChiave: string,
  domandaId: string,
  risposta: boolean | null,
  note: string | null
): Promise<RisultatoSalvataggioRisposta> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }

    const { pool } = await import('@/lib/db');

    // UPDATE-poi-INSERT invece di ON CONFLICT: non dipende da quale
    // vincolo/indice univoco esiste esattamente sulla tabella.
    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".checklist_risposte
       SET risposta = $4, note = $5, updated_at = now()
       WHERE scenario_id = $1 AND modello_chiave = $2 AND domanda_id = $3`,
      [scenarioId, modelloChiave, domandaId, risposta, note]
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".checklist_risposte
           (scenario_id, modello_chiave, domanda_id, risposta, note, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [scenarioId, modelloChiave, domandaId, risposta, note]
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('[salvaRispostaChecklistAction] Errore:', error);
    return { success: false, error: `Impossibile salvare la risposta: ${error.message || error}` };
  }
}

/**
 * Domande escluse per questo scenario — un modello (Ministeriale o
 * custom) resta uguale per tutti, ma non ogni domanda è pertinente a
 * ogni caso. Escludere qui non tocca il modello, né conta come una
 * risposta: la domanda esce dal punteggio di QUESTO scenario.
 */
export interface RisultatoEsclusioniChecklist {
  success: boolean;
  domandeEscluse: string[];
  error?: string;
}

export async function ottieniEsclusioniChecklist(
  nomeSchema: string,
  scenarioId: number,
  modelloChiave: string
): Promise<RisultatoEsclusioniChecklist> {
  try {
    await assicuraTabelleScenari(nomeSchema);
    const { pool } = await import('@/lib/db');
    const risultato = await pool.query(
      `SELECT domanda_id FROM "${nomeSchema}".checklist_esclusioni
       WHERE scenario_id = $1 AND modello_chiave = $2`,
      [scenarioId, modelloChiave]
    );
    return { success: true, domandeEscluse: risultato.rows.map((r) => r.domanda_id) };
  } catch (error: any) {
    console.error('[ottieniEsclusioniChecklist] Errore:', error);
    return {
      success: false,
      domandeEscluse: [],
      error: `Impossibile caricare le esclusioni: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneEsclusione {
  success: boolean;
  error?: string;
}

export async function impostaEsclusioneDomandaAction(
  nomeSchema: string,
  scenarioId: number,
  modelloChiave: string,
  domandaId: string,
  esclusa: boolean
): Promise<RisultatoOperazioneEsclusione> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    const { pool } = await import('@/lib/db');

    if (esclusa) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".checklist_esclusioni (scenario_id, modello_chiave, domanda_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (scenario_id, modello_chiave, domanda_id) DO NOTHING`,
        [scenarioId, modelloChiave, domandaId]
      );
    } else {
      await pool.query(
        `DELETE FROM "${nomeSchema}".checklist_esclusioni
         WHERE scenario_id = $1 AND modello_chiave = $2 AND domanda_id = $3`,
        [scenarioId, modelloChiave, domandaId]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[impostaEsclusioneDomandaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare l'esclusione: ${error.message || error}`,
    };
  }
}
