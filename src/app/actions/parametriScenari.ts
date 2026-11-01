'use server';

// I PARAMETRI DEGLI SCENARI DEL TRIAGE — spese di procedura e percentuali per
// rango (realizzo in liquidazione, soddisfacimento nel cram down).
//
// NESSUN DEFAULT DI PRODOTTO. Le percentuali non stanno nella legge e non sono
// nella piattaforma: le fissa l'ente, che è l'unico a sapere come si comporta
// la propria massa nei due scenari. Una riga vuota è un'ipotesi non
// calcolabile, non uno zero: il report lo dichiara invece di produrre un
// confronto costruito su un numero che nessuno ha scritto.
//
// Solo Admin di spazio: sono parametri che valgono per tutte le aziende.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleScenariTriage } from '@/db/provision';
import {
  RANGHI,
  validaParametri,
  type ParametriScenari,
  type RangoCredito,
} from '@/lib/triage/scenari';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export interface RisultatoParametri {
  success: boolean;
  parametri?: ParametriScenari;
  error?: string;
}

export async function ottieniParametriScenariAction(
  nomeSchema: string
): Promise<RisultatoParametri> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenariTriage(nomeSchema);
    const [config, righe] = await Promise.all([
      pool.query(`SELECT costi_procedura_pct FROM "${nomeSchema}".parametri_scenari WHERE id = 1`),
      pool.query(
        `SELECT rango, tasso_liquidazione_pct, cram_down_pct
           FROM "${nomeSchema}".parametri_scenari_rango`
      ),
    ]);
    const perRango = new Map(righe.rows.map((r) => [String(r.rango), r]));
    return {
      success: true,
      parametri: {
        costiProceduraPct: num(config.rows[0]?.costi_procedura_pct),
        // L'ordine è quello dei ranghi, non quello del database: il report
        // deve leggersi sempre allo stesso modo.
        ranghi: RANGHI.map((r) => {
          const salvata = perRango.get(r.codice);
          return {
            rango: r.codice,
            tassoLiquidazionePct: num(salvata?.tasso_liquidazione_pct),
            cramDownPct: num(salvata?.cram_down_pct),
          };
        }),
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniParametriScenariAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export async function salvaParametriScenariAction(
  nomeSchema: string,
  parametri: ParametriScenari
): Promise<RisultatoParametri> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaParametri(parametri);
    if (errore.length > 0) return { success: false, error: errore.join(' ') };

    await assicuraTabelleScenariTriage(nomeSchema);
    const ammessi = new Set<RangoCredito>(RANGHI.map((r) => r.codice));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO "${nomeSchema}".parametri_scenari (id, costi_procedura_pct)
         VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET costi_procedura_pct = $1`,
        [parametri.costiProceduraPct]
      );
      for (const r of parametri.ranghi) {
        if (!ammessi.has(r.rango)) return { success: false, error: 'Rango non riconosciuto.' };
        await client.query(
          `INSERT INTO "${nomeSchema}".parametri_scenari_rango
             (rango, tasso_liquidazione_pct, cram_down_pct)
           VALUES ($1, $2, $3)
           ON CONFLICT (rango)
           DO UPDATE SET tasso_liquidazione_pct = $2, cram_down_pct = $3`,
          [r.rango, r.tassoLiquidazionePct, r.cramDownPct]
        );
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    return { success: true, parametri };
  } catch (error: unknown) {
    console.error('[salvaParametriScenariAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}
