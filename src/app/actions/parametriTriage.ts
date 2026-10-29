'use server';

// L'obbligo del file V.E.R.A. nel triage, come parametro dello spazio.
//
// Per l'INPS il V.E.R.A. è la fonte delle posizioni da lavorare: senza, il
// triage non ha un elenco da instradare. Per gli altri enti — e per il
// professionista, che il file lo chiede all'istituto — la stessa regola
// bloccava il lavoro senza rimedio. Il default segue l'ente dello spazio; qui
// l'Admin può imporlo o spegnerlo. La regola sta in src/lib/triage.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import {
  leggiObbligoVera,
  scriviObbligoVera,
  type Esecutore,
} from '@/lib/triage/obbligoVeraSpazio';
import type { ObbligoVera } from '@/lib/triage/veraObbligatorio';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface RisultatoObbligoVera {
  success: boolean;
  obbligo?: ObbligoVera;
  error?: string;
}

const eseguiSuPool: Esecutore = async (sql, params) => (await pool.query(sql, params)).rows;

export async function ottieniObbligoVeraAction(nomeSchema: string): Promise<RisultatoObbligoVera> {
  try {
    await richiediAccessoSchema(nomeSchema);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);
    return { success: true, obbligo: await leggiObbligoVera(eseguiSuPool, nomeSchema) };
  } catch (error: unknown) {
    console.error('[ottieniObbligoVeraAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile leggere il parametro: ${(error as Error).message}`,
    };
  }
}

/**
 * `valore = null` riporta l'obbligo all'automatico (segue l'ente dello
 * spazio). Un valore esplicito resta tale anche se coincide con quello
 * dell'ente: è una scelta, e la scheda la distingue.
 */
export async function impostaObbligoVeraAction(
  nomeSchema: string,
  valore: boolean | null
): Promise<RisultatoObbligoVera> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (valore !== null && typeof valore !== 'boolean') {
      return {
        success: false,
        error: 'Valore non valido: obbligatorio, facoltativo o automatico.',
      };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    return { success: true, obbligo: await scriviObbligoVera(eseguiSuPool, nomeSchema, valore) };
  } catch (error: unknown) {
    console.error('[impostaObbligoVeraAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${(error as Error).message}` };
  }
}
