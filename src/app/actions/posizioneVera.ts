'use server';

// Posizione V.E.R.A. — persistenza della mappatura titoli-di-sezione →
// categoria (per spazio) e delle righe VERA importate (per azienda). Il
// confronto certo-per-certo con la Situazione Debitoria contabilizzata è
// calcolato lato client dai due elenchi.

import { pool } from '@/lib/db';
import { assicuraTabelleVera } from '@/db/provision';
import {
  chiaveCombinazione,
  type RigaVera,
  type TrattamentoVera,
} from '@/lib/debitiEnte/veraImport';

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

export interface TitoloVera {
  norm: string;
  titolo: string;
  categoria: string;
}

export interface RisultatoTitoliVera {
  success: boolean;
  titoli: TitoloVera[];
  error?: string;
}

/** Elenco completo delle sezioni VERA riconosciute (titolo + categoria) — il "catalogo" su cui agiscono Correggi/Dimentica. */
export async function ottieniTitoliVera(nomeSchema: string): Promise<RisultatoTitoliVera> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, titoli: [], error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    const r = await pool.query(
      `SELECT titolo_norm, titolo, categoria FROM "${nomeSchema}".vera_titoli ORDER BY titolo ASC`
    );
    return {
      success: true,
      titoli: r.rows.map((x) => ({
        norm: x.titolo_norm,
        titolo: x.titolo,
        categoria: x.categoria,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniTitoliVera] Errore:', error);
    return {
      success: false,
      titoli: [],
      error: `Impossibile caricare le sezioni: ${error.message || error}`,
    };
  }
}

export interface RisultatoCorrezioneVera {
  success: boolean;
  /** Righe VERA già importate a cui la nuova categoria è stata ri-applicata. */
  righeAggiornate?: number;
  error?: string;
}

/**
 * CORREGGI (come nella Posizione Debitoria): cambia la categoria di una sezione
 * VERA e la RI-APPLICA anche alle righe già importate (in ogni azienda), senza
 * ricaricare il file. Vale per sempre: i prossimi caricamenti useranno la nuova
 * categoria.
 */
export async function aggiornaTitoloVeraAction(
  nomeSchema: string,
  norm: string,
  categoria: string
): Promise<RisultatoCorrezioneVera> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!categoria) return { success: false, error: 'Scegli una categoria.' };
    await assicuraTabelleVera(nomeSchema);
    const ris = await pool.query(
      `UPDATE "${nomeSchema}".vera_titoli SET categoria = $2 WHERE titolo_norm = $1 RETURNING titolo`,
      [norm, categoria]
    );
    if (ris.rows.length === 0) return { success: false, error: 'Sezione non trovata.' };
    const titolo = ris.rows[0].titolo as string;
    const upd = await pool.query(
      `UPDATE "${nomeSchema}".debiti_vera SET categoria = $2 WHERE sezione = $1`,
      [titolo, categoria]
    );
    return { success: true, righeAggiornate: upd.rowCount ?? 0 };
  } catch (error: any) {
    console.error('[aggiornaTitoloVeraAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile correggere la sezione: ${error.message || error}`,
    };
  }
}

/**
 * DIMENTICA (come nella Posizione Debitoria): rimuove la mappatura della
 * sezione (così al prossimo caricamento verrà richiesta di nuovo) ed elimina le
 * righe VERA di quella sezione per QUESTA azienda.
 */
export async function dimenticaTitoloVeraAction(
  nomeSchema: string,
  norm: string,
  aziendaId: number
): Promise<RisultatoOperazioneVera> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    const ris = await pool.query(
      `SELECT titolo FROM "${nomeSchema}".vera_titoli WHERE titolo_norm = $1`,
      [norm]
    );
    if (ris.rows.length > 0) {
      const titolo = ris.rows[0].titolo as string;
      await pool.query(
        `DELETE FROM "${nomeSchema}".debiti_vera WHERE azienda_id = $1 AND sezione = $2`,
        [aziendaId, titolo]
      );
    }
    await pool.query(`DELETE FROM "${nomeSchema}".vera_titoli WHERE titolo_norm = $1`, [norm]);
    return { success: true };
  } catch (error: any) {
    console.error('[dimenticaTitoloVeraAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile dimenticare la sezione: ${error.message || error}`,
    };
  }
}

// ---------------------------------------------------------------- Trattamenti
export interface RisultatoMappaturaTrattamenti {
  success: boolean;
  /** chiave combinazione → trattamento */
  mappatura: Record<string, TrattamentoVera>;
  error?: string;
}

export async function ottieniMappaturaTrattamentiVera(
  nomeSchema: string
): Promise<RisultatoMappaturaTrattamenti> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, mappatura: {}, error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    const r = await pool.query(`SELECT chiave, trattamento FROM "${nomeSchema}".vera_trattamenti`);
    const mappatura: Record<string, TrattamentoVera> = {};
    for (const x of r.rows) mappatura[x.chiave] = x.trattamento as TrattamentoVera;
    return { success: true, mappatura };
  } catch (error: any) {
    console.error('[ottieniMappaturaTrattamentiVera] Errore:', error);
    return {
      success: false,
      mappatura: {},
      error: `Impossibile caricare: ${error.message || error}`,
    };
  }
}

export interface TrattamentoVeraRiga {
  chiave: string;
  natura: string;
  stato: string;
  trattamento: TrattamentoVera;
}

export interface RisultatoTrattamenti {
  success: boolean;
  trattamenti: TrattamentoVeraRiga[];
  error?: string;
}

export async function ottieniTrattamentiVera(nomeSchema: string): Promise<RisultatoTrattamenti> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, trattamenti: [], error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    const r = await pool.query(
      `SELECT chiave, natura, stato, trattamento FROM "${nomeSchema}".vera_trattamenti ORDER BY natura ASC, stato ASC`
    );
    return {
      success: true,
      trattamenti: r.rows.map((x) => ({
        chiave: x.chiave,
        natura: x.natura,
        stato: x.stato,
        trattamento: x.trattamento as TrattamentoVera,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniTrattamentiVera] Errore:', error);
    return {
      success: false,
      trattamenti: [],
      error: `Impossibile caricare: ${error.message || error}`,
    };
  }
}

/** Aggiunge/aggiorna il trattamento di una o più combinazioni Natura+Stato. */
export async function salvaTrattamentiVeraAction(
  nomeSchema: string,
  voci: { chiave: string; natura: string; stato: string; trattamento: TrattamentoVera }[]
): Promise<RisultatoOperazioneVera> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    for (const v of voci) {
      if (!v.chiave || !v.trattamento) continue;
      await pool.query(
        `INSERT INTO "${nomeSchema}".vera_trattamenti (chiave, natura, stato, trattamento)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (chiave) DO UPDATE SET natura = EXCLUDED.natura, stato = EXCLUDED.stato, trattamento = EXCLUDED.trattamento`,
        [v.chiave, v.natura, v.stato, v.trattamento]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[salvaTrattamentiVeraAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare i trattamenti: ${error.message || error}`,
    };
  }
}

export interface RisultatoCorrezioneTrattamento {
  success: boolean;
  righeAggiornate?: number;
  error?: string;
}

/** CORREGGI un trattamento e ri-applicalo alle righe già importate (per combinazione). */
export async function aggiornaTrattamentoVeraAction(
  nomeSchema: string,
  chiave: string,
  trattamento: TrattamentoVera
): Promise<RisultatoCorrezioneTrattamento> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    await pool.query(
      `UPDATE "${nomeSchema}".vera_trattamenti SET trattamento = $2 WHERE chiave = $1`,
      [chiave, trattamento]
    );
    const upd = await pool.query(
      `UPDATE "${nomeSchema}".debiti_vera SET trattamento = $2 WHERE combinazione = $1`,
      [chiave, trattamento]
    );
    return { success: true, righeAggiornate: upd.rowCount ?? 0 };
  } catch (error: any) {
    console.error('[aggiornaTrattamentoVeraAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile correggere il trattamento: ${error.message || error}`,
    };
  }
}

/** DIMENTICA una combinazione: rimuove la mappatura ed elimina le sue righe per questa azienda. */
export async function dimenticaTrattamentoVeraAction(
  nomeSchema: string,
  chiave: string,
  aziendaId: number
): Promise<RisultatoOperazioneVera> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleVera(nomeSchema);
    await pool.query(
      `DELETE FROM "${nomeSchema}".debiti_vera WHERE azienda_id = $1 AND combinazione = $2`,
      [aziendaId, chiave]
    );
    await pool.query(`DELETE FROM "${nomeSchema}".vera_trattamenti WHERE chiave = $1`, [chiave]);
    return { success: true };
  } catch (error: any) {
    console.error('[dimenticaTrattamentoVeraAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile dimenticare la combinazione: ${error.message || error}`,
    };
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
      `SELECT id, sezione, voce, importo, categoria, stato, trattamento FROM "${nomeSchema}".debiti_vera
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
        trattamento: (x.trattamento ?? 'contabilizzato') as TrattamentoVera,
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
        `INSERT INTO "${nomeSchema}".debiti_vera (azienda_id, sezione, voce, importo, categoria, stato, trattamento, combinazione)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          aziendaId,
          r.sezione,
          r.voce,
          r.importo,
          r.categoria,
          r.stato ?? '',
          r.trattamento ?? 'contabilizzato',
          chiaveCombinazione(r.voce, r.stato ?? ''),
        ]
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
