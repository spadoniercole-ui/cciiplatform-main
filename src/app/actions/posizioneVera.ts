'use server';

// Posizione V.E.R.A. — persistenza della mappatura titoli-di-sezione →
// categoria (per spazio) e delle righe VERA importate (per azienda). Il
// confronto certo-per-certo con la Situazione Debitoria contabilizzata è
// calcolato lato client dai due elenchi.

import { pool } from '@/lib/db';
import { assicuraTabelleVera } from '@/db/provision';
import type { RigaVera } from '@/lib/debitiEnte/veraImport';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface RisultatoMappaturaTitoliVera {
  success: boolean;
  /** norm(titolo) → codice categoria */
  mappatura: Record<string, string>;
  error?: string;
}

export async function ottieniMappaturaTitoliVera(
  nomeSchema: string
): Promise<RisultatoMappaturaTitoliVera> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, mappatura: {}, error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    const r = await pool.query(`SELECT titolo_norm, categoria FROM "${nomeSchema}".vera_titoli`);
    const mappatura: Record<string, string> = {};
    for (const x of r.rows) mappatura[x.titolo_norm] = x.categoria;
    return { success: true, mappatura };
  } catch (error: any) {
    console.error('[ottieniMappaturaTitoliVera] Errore:', error);
    return {
      success: false,
      mappatura: {},
      error: `Impossibile caricare la mappatura: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneVera {
  success: boolean;
  error?: string;
}

/** Aggiunge/aggiorna la categoria di uno o più titoli di sezione. */
export async function salvaMappaturaTitoliVeraAction(
  nomeSchema: string,
  voci: { norm: string; label: string; categoria: string }[]
): Promise<RisultatoOperazioneVera> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    for (const v of voci) {
      if (!v.norm || !v.categoria) continue;
      await pool.query(
        `INSERT INTO "${nomeSchema}".vera_titoli (titolo_norm, titolo, categoria)
         VALUES ($1, $2, $3)
         ON CONFLICT (titolo_norm) DO UPDATE SET titolo = EXCLUDED.titolo, categoria = EXCLUDED.categoria`,
        [v.norm, v.label, v.categoria]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[salvaMappaturaTitoliVeraAction] Errore:', error);
    return { success: false, error: `Impossibile salvare la mappatura: ${error.message || error}` };
  }
}

export interface RigaVeraSalvata extends RigaVera {
  id: number;
}

export interface RisultatoElencoVera {
  success: boolean;
  righe: RigaVeraSalvata[];
  error?: string;
}

export async function ottieniDebitiVera(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoElencoVera> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, righe: [], error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    const r = await pool.query(
      `SELECT id, sezione, voce, importo, categoria, stato FROM "${nomeSchema}".debiti_vera
       WHERE azienda_id = $1 ORDER BY id ASC`,
      [aziendaId]
    );
    return {
      success: true,
      righe: r.rows.map((x) => ({
        id: x.id,
        sezione: x.sezione,
        voce: x.voce,
        importo: Number(x.importo),
        categoria: x.categoria,
        stato: x.stato ?? '',
      })),
    };
  } catch (error: any) {
    console.error('[ottieniDebitiVera] Errore:', error);
    return {
      success: false,
      righe: [],
      error: `Impossibile caricare la posizione VERA: ${error.message || error}`,
    };
  }
}

/** Sostituisce integralmente le righe VERA di un'azienda (un file = una fotografia). */
export async function sostituisciDebitiVeraAction(
  nomeSchema: string,
  aziendaId: number,
  righe: RigaVera[]
): Promise<RisultatoOperazioneVera> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_vera WHERE azienda_id = $1`, [aziendaId]);
    for (const r of righe) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".debiti_vera (azienda_id, sezione, voce, importo, categoria, stato)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [aziendaId, r.sezione, r.voce, r.importo, r.categoria, r.stato ?? '']
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[sostituisciDebitiVeraAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare la posizione VERA: ${error.message || error}`,
    };
  }
}
