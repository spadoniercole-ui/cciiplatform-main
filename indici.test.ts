'use server';

// Funzioni "plus" — non incluse nella licenza base (Posizione Ente,
// Proposta, XBRL, Posizione Aggiornata, Indici, Check List, Brogliaccio,
// e l'assistente/chatbot restano sempre disponibili): Dati di Settore,
// Simulazione, Relazione AI si attivano una per una, per spazio, dal
// superadmin. Partono tutte disattivate — "in configurazione standard
// non sono comprese nella licenza base", come richiesto esplicitamente.

import { pool } from '@/lib/db';
import { assicuraTabelleSpazi } from '@/db/ensureTables';

export interface FunzioniPlus {
  datiSettore: boolean;
  simulazione: boolean;
  relazioneAi: boolean;
}

const VUOTE: FunzioniPlus = { datiSettore: false, simulazione: false, relazioneAi: false };

export interface RisultatoFunzioniPlus {
  success: boolean;
  funzioni: FunzioniPlus;
  error?: string;
}

export async function ottieniFunzioniPlusSpazio(
  nomeSchema: string
): Promise<RisultatoFunzioniPlus> {
  try {
    await assicuraTabelleSpazi();
    const risultato = await pool.query(
      `SELECT l.plus_dati_settore, l.plus_simulazione, l.plus_relazione_ai
       FROM public.spazi s
       JOIN public.licenze_spazio l ON l.spazio_id = s.id
       WHERE s.nome_schema = $1`,
      [nomeSchema]
    );
    if (risultato.rows.length === 0) {
      return { success: true, funzioni: VUOTE };
    }
    const r = risultato.rows[0];
    return {
      success: true,
      funzioni: {
        datiSettore: r.plus_dati_settore,
        simulazione: r.plus_simulazione,
        relazioneAi: r.plus_relazione_ai,
      },
    };
  } catch (error: any) {
    console.error('[ottieniFunzioniPlusSpazio] Errore:', error);
    return {
      success: false,
      funzioni: VUOTE,
      error: `Impossibile leggere le funzioni plus: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneFunzioniPlus {
  success: boolean;
  error?: string;
}

export async function aggiornaFunzioniPlusAction(
  spazioId: number,
  funzioni: FunzioniPlus
): Promise<RisultatoOperazioneFunzioniPlus> {
  try {
    await assicuraTabelleSpazi();
    const aggiornata = await pool.query(
      `UPDATE public.licenze_spazio
       SET plus_dati_settore = $2, plus_simulazione = $3, plus_relazione_ai = $4
       WHERE spazio_id = $1`,
      [spazioId, funzioni.datiSettore, funzioni.simulazione, funzioni.relazioneAi]
    );
    if (aggiornata.rowCount === 0) {
      return { success: false, error: 'Nessuna licenza operativa trovata per questo spazio.' };
    }
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaFunzioniPlusAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare le funzioni plus: ${error.message || error}`,
    };
  }
}
