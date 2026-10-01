'use server';

// Memoria dei tracciati dei bilancini (vedi assicuraTabellaTracciatiBilancino).
// Ordine di ricerca:
// 1. stessa azienda e stessa intestazione → colonne e classificazione dei conti;
// 2. stessa azienda, intestazione diversa (il software è cambiato) → solo la
//    classificazione dei conti, le colonne si riconoscono di nuovo;
// 3. altra azienda, stessa intestazione (stesso software) → solo le colonne:
//    il piano dei conti di un'altra azienda non si presta.

import { richiediAccessoAzienda } from '@/lib/autorizzazione';
import { pool } from '@/lib/db';
import { assicuraTabellaTracciatiBilancino } from '@/db/provision';
import { isIdCategoria, type IdCategoria } from '@/lib/bilancino/categorie';
import type { ColonneBilancino, ModoImporti } from '@/lib/bilancino/lettura';

export interface TracciatoTrovato {
  origine: 'stessa_azienda' | 'stessa_azienda_altro_formato' | 'altra_azienda';
  colonne: ColonneBilancino | null;
  mappa: Record<string, IdCategoria>;
  aggiornatoIl: string | null;
}

const MODI: ModoImporti[] = [
  'dare_avere',
  'saldo_dare_positivo',
  'saldo_avere_positivo',
  'saldo_senza_segno',
];

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

function colonnePulite(c: any): ColonneBilancino | null {
  if (!c || typeof c !== 'object') return null;
  const idx = (v: unknown) =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) < 500 ? (v as number) : null;
  const descrizione = idx(c.descrizione);
  if (descrizione === null || !MODI.includes(c.modo)) return null;
  return {
    rigaIntestazione: Number.isInteger(c.rigaIntestazione)
      ? Math.max(-1, Math.min(c.rigaIntestazione, 500))
      : -1,
    codice: idx(c.codice),
    descrizione,
    dare: idx(c.dare),
    avere: idx(c.avere),
    saldo: idx(c.saldo),
    modo: c.modo,
  };
}

function mappaPulita(m: any): Record<string, IdCategoria> {
  const out: Record<string, IdCategoria> = {};
  if (!m || typeof m !== 'object') return out;
  for (const [k, v] of Object.entries(m)) {
    if (typeof k === 'string' && k.length <= 300 && isIdCategoria(v)) out[k] = v;
  }
  return out;
}

export async function ottieniTracciatoBilancinoAction(
  nomeSchema: string,
  aziendaId: number,
  firma: string
): Promise<{ success: boolean; tracciato: TracciatoTrovato | null; error?: string }> {
  if (!validaSchema(nomeSchema))
    return { success: false, tracciato: null, error: 'Nome schema non valido.' };
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    await assicuraTabellaTracciatiBilancino(nomeSchema);
    const stessa = await pool.query(
      `SELECT firma, colonne, mappa, aggiornato_il FROM "${nomeSchema}".tracciati_bilancino
       WHERE azienda_id = $1 ORDER BY (firma = $2) DESC, aggiornato_il DESC LIMIT 1`,
      [aziendaId, firma]
    );
    if (stessa.rows.length > 0) {
      const r = stessa.rows[0];
      const uguale = r.firma === firma;
      return {
        success: true,
        tracciato: {
          origine: uguale ? 'stessa_azienda' : 'stessa_azienda_altro_formato',
          colonne: uguale ? colonnePulite(r.colonne) : null,
          mappa: mappaPulita(r.mappa),
          aggiornatoIl: r.aggiornato_il ? new Date(r.aggiornato_il).toISOString() : null,
        },
      };
    }
    const altra = await pool.query(
      `SELECT colonne, aggiornato_il FROM "${nomeSchema}".tracciati_bilancino
       WHERE firma = $1 ORDER BY aggiornato_il DESC LIMIT 1`,
      [firma]
    );
    if (altra.rows.length > 0) {
      return {
        success: true,
        tracciato: {
          origine: 'altra_azienda',
          colonne: colonnePulite(altra.rows[0].colonne),
          mappa: {},
          aggiornatoIl: altra.rows[0].aggiornato_il
            ? new Date(altra.rows[0].aggiornato_il).toISOString()
            : null,
        },
      };
    }
    return { success: true, tracciato: null };
  } catch (error: any) {
    console.error('[ottieniTracciatoBilancinoAction] Errore:', error);
    return {
      success: false,
      tracciato: null,
      error: `Impossibile leggere i tracciati: ${error.message || error}`,
    };
  }
}

/** Salva colonne e classificazione confermate. La classificazione si unisce
 * a quella già memorizzata per l'azienda (i conti nuovi si aggiungono, quelli
 * riclassificati si aggiornano). */
export async function salvaTracciatoBilancinoAction(
  nomeSchema: string,
  aziendaId: number,
  firma: string,
  colonne: ColonneBilancino,
  mappa: Record<string, IdCategoria>
): Promise<{ success: boolean; error?: string }> {
  if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
  const col = colonnePulite(colonne);
  if (!col) return { success: false, error: 'Colonne del tracciato non valide.' };
  if (typeof firma !== 'string' || !firma || firma.length > 2000)
    return { success: false, error: 'Intestazione non valida.' };
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    await assicuraTabellaTracciatiBilancino(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".tracciati_bilancino (azienda_id, firma, colonne, mappa)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (azienda_id, firma) DO UPDATE SET
         colonne = EXCLUDED.colonne,
         mappa = "${nomeSchema}".tracciati_bilancino.mappa || EXCLUDED.mappa,
         aggiornato_il = now()`,
      [aziendaId, firma, JSON.stringify(col), JSON.stringify(mappaPulita(mappa))]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[salvaTracciatoBilancinoAction] Errore:', error);
    return { success: false, error: `Impossibile salvare il tracciato: ${error.message || error}` };
  }
}
