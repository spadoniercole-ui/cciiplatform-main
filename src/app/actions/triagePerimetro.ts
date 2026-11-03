'use server';

// IL RANGO DEL CREDITO NEL TRIAGE — lettura e salvataggio.
//
// Era il file della check di perimetro: quella check è stata ritirata nella
// 0.163.0 (le sue voci nascevano dai contrassegni sulle materie, che non si
// impostano più). Resta il rango, che è una scelta per azienda e serve al
// confronto con gli scenari.
//
// Solo Admin di spazio, come le altre funzioni del triage: la pagina è già
// riservata, la guardia non si fida della pagina.

import { pool } from '@/lib/db';
import { richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleScenariTriage } from '@/db/provision';
import type { RangoCredito } from '@/lib/triage/scenari';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface RisultatoRango {
  success: boolean;
  rango?: RangoCredito | null;
  error?: string;
}

/** Il rango del credito dell'ente: è una scelta per azienda, non un default. */
export async function ottieniRangoCreditoAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoRango> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    await assicuraTabelleScenariTriage(nomeSchema);
    const r = await pool.query(
      `SELECT rango FROM "${nomeSchema}".triage_scenario WHERE azienda_id = $1`,
      [aziendaId]
    );
    return { success: true, rango: (r.rows[0]?.rango as RangoCredito) ?? null };
  } catch (error: unknown) {
    console.error('[ottieniRangoCreditoAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export async function salvaRangoCreditoAction(
  nomeSchema: string,
  aziendaId: number,
  rango: RangoCredito | null
): Promise<RisultatoRango> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    await assicuraTabelleScenariTriage(nomeSchema);
    const ammessi: RangoCredito[] = [
      'PREDEDUCIBILE',
      'PRIVILEGIATO',
      'CHIROGRAFARIO',
      'POSTERGATO',
    ];
    if (rango !== null && !ammessi.includes(rango))
      return { success: false, error: 'Rango non riconosciuto.' };
    if (rango === null) {
      await pool.query(`DELETE FROM "${nomeSchema}".triage_scenario WHERE azienda_id = $1`, [
        aziendaId,
      ]);
    } else {
      await pool.query(
        `INSERT INTO "${nomeSchema}".triage_scenario (azienda_id, rango, aggiornato_il)
         VALUES ($1, $2, now())
         ON CONFLICT (azienda_id) DO UPDATE SET rango = $2, aggiornato_il = now()`,
        [aziendaId, rango]
      );
    }
    return { success: true, rango };
  } catch (error: unknown) {
    console.error('[salvaRangoCreditoAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}
