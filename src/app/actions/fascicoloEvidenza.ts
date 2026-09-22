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
  assicuraTabellaXbrlAzienda,
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
    await assicuraTabellaXbrlAzienda(nomeSchema);

    const proposta =
      scenarioId === null
        ? { rows: [] }
        : await pool.query(
            `SELECT p.id, p.categoria_creditore, p.importo_dovuto, p.percentuale_offerta, p.rango_legale,
                    o.nome_file, o.impronta
               FROM "${nomeSchema}".proposta_creditori p
               LEFT JOIN "${nomeSchema}".documenti_origine o ON o.id = p.documento_id
              WHERE p.scenario_id = $1 ORDER BY p.id`,
            [scenarioId]
          );
    // La posizione dell'ente puo' essere dell'azienda o aggiornata sullo scenario:
    // si prendono le righe dello scenario se ci sono, altrimenti quelle dell'azienda.
    const ente = await pool.query(
      `SELECT d.id, d.voce, d.importo, d.importo_versato, d.tipo, d.data, d.scenario_id,
              o.nome_file, o.impronta
         FROM "${nomeSchema}".debiti_ente d
         LEFT JOIN "${nomeSchema}".documenti_origine o ON o.id = d.documento_id
        WHERE d.azienda_id = $1 ORDER BY d.id`,
      [aziendaId]
    );
    const righeScenario = ente.rows.filter(
      (r) => scenarioId !== null && Number(r.scenario_id) === scenarioId
    );
    const righeEnte =
      righeScenario.length > 0 ? righeScenario : ente.rows.filter((r) => r.scenario_id === null);
    const vera = await pool.query(
      `SELECT v.id, v.sezione, v.voce, v.importo, v.categoria, v.trattamento, o.nome_file, o.impronta
         FROM "${nomeSchema}".debiti_vera v
         LEFT JOIN "${nomeSchema}".documenti_origine o ON o.id = v.documento_id
        WHERE v.azienda_id = $1 ORDER BY v.id`,
      [aziendaId]
    );

    const bilanci = await pool.query(
      `SELECT x.id, x.anno_bilancio, x.nome_file, x.dati_finanziari, o.nome_file AS doc_nome, o.impronta
         FROM "${nomeSchema}".xbrl_storico_azienda x
         LEFT JOIN "${nomeSchema}".documenti_origine o ON o.id = x.documento_id
        WHERE x.azienda_id = $1 ORDER BY x.anno_bilancio DESC NULLS LAST`,
      [aziendaId]
    );
    const CHIAVI_BILANCIO = [
      'ricaviVendite',
      'valoreProduzione',
      'costiProduzione',
      'ebitda',
      'oneriFinanziari',
      'utileEsercizio',
      'totaleAttivo',
      'attivoCircolante',
      'disponibilitaLiquide',
      'patrimonioNetto',
      'totaleDebiti',
      'debitiBanche',
      'debitiFornitori',
      'debitiTributari',
      'debitiPrevidenziali',
    ] as const;

    return {
      success: true,
      fascicolo: componiFascicolo({
        bilanci: bilanci.rows.map((r) => {
          const d = (r.dati_finanziari ?? {}) as Record<string, unknown>;
          const voci: Record<string, number> = {};
          for (const k of CHIAVI_BILANCIO) {
            const v = d[k];
            if (typeof v === 'number' && Number.isFinite(v)) voci[k] = v;
          }
          return {
            id: Number(r.id),
            anno: r.anno_bilancio === null ? null : Number(r.anno_bilancio),
            comparativo: /comparativo/i.test(String(r.nome_file ?? '')),
            documento: r.impronta ? { nomeFile: r.doc_nome, impronta: r.impronta } : null,
            voci,
          };
        }),
        proposta: proposta.rows.map((r) => ({
          id: r.id,
          categoriaCreditore: r.categoria_creditore,
          importoDovuto: Number(r.importo_dovuto),
          percentualeOfferta: Number(r.percentuale_offerta),
          rangoLegale: r.rango_legale ?? null,
          documento: r.impronta ? { nomeFile: r.nome_file, impronta: r.impronta } : null,
        })),
        posizioneEnte: righeEnte.map((r) => ({
          id: r.id,
          voce: r.voce,
          importo: Number(r.importo),
          importoVersato: r.importo_versato === null ? null : Number(r.importo_versato),
          tipo: r.tipo,
          data: dataIso(r.data),
          documento: r.impronta ? { nomeFile: r.nome_file, impronta: r.impronta } : null,
        })),
        vera: vera.rows.map((r) => ({
          id: r.id,
          sezione: r.sezione,
          voce: r.voce,
          importo: Number(r.importo),
          categoria: r.categoria,
          trattamento: r.trattamento,
          documento: r.impronta ? { nomeFile: r.nome_file, impronta: r.impronta } : null,
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
