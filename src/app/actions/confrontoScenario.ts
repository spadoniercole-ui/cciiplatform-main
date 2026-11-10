'use server';

// SOVRASCRITTURE DEL DATO AZIENDALE (0.196.0).
//
// La simulazione base resta com'è: qui si registra, cella per cella, che cosa
// il valutatore ha corretto e di quanto. Il valore di base e la differenza li
// calcola il server leggendo la simulazione salvata — il browser manda solo
// anno, voce e importo inserito, mai il delta.

import { pool } from '@/lib/db';
import { richiediAccessoScenario } from '@/lib/autorizzazione';
import { assicuraTabelleScenari } from '@/db/provision';
import { leggiSimulazioneBase } from '@/lib/verificaAzienda/baseSimulazione';
import { VOCI_MAPPA } from '@/lib/verificaAzienda/simulazione';
import {
  differenza,
  riepilogaSovrascritture,
  type Sovrascrittura,
  type StatisticaSovrascritture,
} from '@/lib/scenari/confronto';

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);
const VOCI = new Set(VOCI_MAPPA.map((v) => v.chiave as string));

export interface SovrascritturaInput {
  anno: number;
  voce: string;
  /** null o vuoto = torna al dato di base, la riga viene rimossa. */
  valoreInserito: number | null;
}

export interface RisultatoSovrascritture {
  success: boolean;
  sovrascritture?: Sovrascrittura[];
  statistiche?: StatisticaSovrascritture;
  error?: string;
}

async function leggiRighe(nomeSchema: string, scenarioId: number): Promise<Sovrascrittura[]> {
  const r = await pool.query(
    `SELECT id, anno, voce, valore_base, valore_inserito, differenza, autore,
            to_char(aggiornata_il, 'YYYY-MM-DD"T"HH24:MI') AS aggiornata_il
       FROM "${nomeSchema}".scenario_sovrascritture
      WHERE scenario_id = $1
      ORDER BY anno, voce`,
    [scenarioId]
  );
  return r.rows.map((riga) => ({
    id: Number(riga.id),
    anno: Number(riga.anno),
    voce: String(riga.voce),
    valoreBase: Number(riga.valore_base),
    valoreInserito: Number(riga.valore_inserito),
    differenza: Number(riga.differenza),
    autore: riga.autore ? String(riga.autore) : null,
    aggiornataIl: riga.aggiornata_il ? String(riga.aggiornata_il) : null,
  }));
}

export async function ottieniSovrascrittureAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoSovrascritture> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const esistenza = await pool.query(`SELECT to_regclass($1) AS tabella`, [
      `${nomeSchema}.scenario_sovrascritture`,
    ]);
    const righe = esistenza.rows[0]?.tabella ? await leggiRighe(nomeSchema, scenarioId) : [];
    return { success: true, sovrascritture: righe, statistiche: riepilogaSovrascritture(righe) };
  } catch (error: unknown) {
    console.error('[ottieniSovrascrittureAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export async function salvaSovrascrittureAction(
  nomeSchema: string,
  scenarioId: number,
  righe: SovrascritturaInput[]
): Promise<RisultatoSovrascritture> {
  try {
    const contesto = await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: 'scenari',
      livello: 'SCRITTURA',
    });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenari(nomeSchema);

    const scenario = await pool.query(
      `SELECT azienda_id FROM "${nomeSchema}".scenari WHERE id = $1`,
      [scenarioId]
    );
    const aziendaId = Number(scenario.rows[0]?.azienda_id);
    if (!aziendaId) return { success: false, error: 'Scenario non trovato.' };

    const base = await leggiSimulazioneBase(nomeSchema, aziendaId);
    if (!base) {
      return {
        success: false,
        error:
          'La simulazione base non è più disponibile: riapri la verifica azienda e salva di nuovo la base.',
      };
    }

    // Il dato di riferimento è solo lo storico: le proiezioni le calcola il
    // motore e non si sovrascrivono da qui.
    const valoriBase = new Map<string, number>();
    for (const colonna of base.colonne) {
      if (colonna.tipo !== 'STORICO') continue;
      for (const voce of VOCI_MAPPA) {
        const valore = colonna.dati?.[voce.chiave];
        if (typeof valore === 'number' && Number.isFinite(valore)) {
          valoriBase.set(`${colonna.anno}|${voce.chiave}`, valore);
        }
      }
    }

    const ammesse: { anno: number; voce: string; valoreBase: number; valoreInserito: number }[] =
      [];
    for (const riga of righe.slice(0, 500)) {
      if (!Number.isInteger(riga.anno) || !VOCI.has(riga.voce)) continue;
      const baseVoce = valoriBase.get(`${riga.anno}|${riga.voce}`);
      if (baseVoce === undefined) continue;
      if (riga.valoreInserito === null || !Number.isFinite(riga.valoreInserito)) continue;
      ammesse.push({
        anno: riga.anno,
        voce: riga.voce,
        valoreBase: baseVoce,
        valoreInserito: riga.valoreInserito,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const riga of ammesse) {
        const delta = differenza(riga.valoreBase, riga.valoreInserito);
        if (Math.abs(delta) < 0.005) {
          await client.query(
            `DELETE FROM "${nomeSchema}".scenario_sovrascritture
              WHERE scenario_id = $1 AND anno = $2 AND voce = $3`,
            [scenarioId, riga.anno, riga.voce]
          );
          continue;
        }
        await client.query(
          `INSERT INTO "${nomeSchema}".scenario_sovrascritture
             (scenario_id, anno, voce, valore_base, valore_inserito, differenza, autore, aggiornata_il)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (scenario_id, anno, voce) DO UPDATE SET
             valore_base = EXCLUDED.valore_base,
             valore_inserito = EXCLUDED.valore_inserito,
             differenza = EXCLUDED.differenza,
             autore = EXCLUDED.autore,
             aggiornata_il = now()`,
          [
            scenarioId,
            riga.anno,
            riga.voce,
            riga.valoreBase,
            riga.valoreInserito,
            delta,
            contesto.email ?? null,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const salvate = await leggiRighe(nomeSchema, scenarioId);
    return {
      success: true,
      sovrascritture: salvate,
      statistiche: riepilogaSovrascritture(salvate),
    };
  } catch (error: unknown) {
    console.error('[salvaSovrascrittureAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}
