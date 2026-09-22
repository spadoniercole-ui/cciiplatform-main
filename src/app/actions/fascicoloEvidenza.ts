'use server';

// Fascicolo di evidenza: compone AL VOLO le evidenze dai dati che la
// piattaforma ha gia' (proposta, posizione debitoria dell'ente, V.E.R.A.).
// Nessuna tabella nuova, nessuno stato da tenere allineato. La logica e' in
// src/lib/fascicolo/evidenza.ts; qui solo la lettura.

import { pool } from '@/lib/db';
import {
  assicuraTabellaProposta,
  assicuraTabellaDebitiEnte,
  assicuraTabelleVera,
} from '@/db/provision';
import { componiFascicolo, type Evidenza } from '@/lib/fascicolo/evidenza';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

function dataIso(valore: unknown): string | null {
  if (!valore) return null;
  const d = valore instanceof Date ? valore : new Date(String(valore));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function ottieniFascicoloAction(
  nomeSchema: string,
  aziendaId: number,
  scenarioId: number | null
): Promise<{ success: boolean; fascicolo?: Evidenza[]; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaProposta(nomeSchema);
    await assicuraTabellaDebitiEnte(nomeSchema);
    await assicuraTabelleVera(nomeSchema);

    const proposta =
      scenarioId === null
        ? { rows: [] }
        : await pool.query(
            `SELECT id, categoria_creditore, importo_dovuto, percentuale_offerta, rango_legale
               FROM "${nomeSchema}".proposta_creditori WHERE scenario_id = $1 ORDER BY id`,
            [scenarioId]
          );
    // La posizione dell'ente puo' essere dell'azienda o aggiornata sullo scenario:
    // si prendono le righe dello scenario se ci sono, altrimenti quelle dell'azienda.
    const ente = await pool.query(
      `SELECT id, voce, importo, importo_versato, tipo, data, scenario_id
         FROM "${nomeSchema}".debiti_ente WHERE azienda_id = $1 ORDER BY id`,
      [aziendaId]
    );
    const righeScenario = ente.rows.filter(
      (r) => scenarioId !== null && Number(r.scenario_id) === scenarioId
    );
    const righeEnte =
      righeScenario.length > 0 ? righeScenario : ente.rows.filter((r) => r.scenario_id === null);
    const vera = await pool.query(
      `SELECT id, sezione, voce, importo, categoria, trattamento
         FROM "${nomeSchema}".debiti_vera WHERE azienda_id = $1 ORDER BY id`,
      [aziendaId]
    );

    return {
      success: true,
      fascicolo: componiFascicolo({
        proposta: proposta.rows.map((r) => ({
          id: r.id,
          categoriaCreditore: r.categoria_creditore,
          importoDovuto: Number(r.importo_dovuto),
          percentualeOfferta: Number(r.percentuale_offerta),
          rangoLegale: r.rango_legale ?? null,
        })),
        posizioneEnte: righeEnte.map((r) => ({
          id: r.id,
          voce: r.voce,
          importo: Number(r.importo),
          importoVersato: r.importo_versato === null ? null : Number(r.importo_versato),
          tipo: r.tipo,
          data: dataIso(r.data),
        })),
        vera: vera.rows.map((r) => ({
          id: r.id,
          sezione: r.sezione,
          voce: r.voce,
          importo: Number(r.importo),
          categoria: r.categoria,
          trattamento: r.trattamento,
        })),
      }),
    };
  } catch (error: unknown) {
    console.error('[ottieniFascicoloAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile comporre il fascicolo di evidenza: ${(error as Error).message || error}`,
    };
  }
}
