// src/lib/triage/letturaParametriScenari.ts
//
// LA LETTURA DEI PARAMETRI DEGLI SCENARI A VERSIONI (0.256.33).
//
// Un solo posto che sa quali percentuali valgono: i punti che calcolano
// (fotografia della verifica azienda, stima senza provvedimento, confronto,
// pagina dei parametri, triage) leggono da qui invece di rifare la query.
//
// Tre modi di leggere, e la differenza è sostanza:
//
//  - `leggiParametriAllaData` — le percentuali in vigore in un dato giorno.
//    È il modo dei calcoli nuovi: se oggi l'ente ha pubblicato una versione
//    con decorrenza oggi, è quella; se ha programmato una versione per il
//    mese prossimo, fino ad allora vale la precedente.
//  - `leggiParametriCongelati` — l'istantanea salvata su un documento chiuso:
//    la verifica o il progetto già chiusi non cambiano numeri perché l'ente ha
//    aggiornato i parametri dopo. Non è un rimando: cancellare una versione
//    non tocca un documento depositato.
//  - `leggiParametriCorrenti` — la tabella storica (`parametri_scenari`), per
//    gli spazi che non hanno ancora versioni (migrati alla prima apertura) e
//    per i ripristini di backup vecchi.
//
// Nessun default: una riga vuota resta vuota, e chi calcola dichiara l'ipotesi
// non calcolabile.

import { pool } from '@/lib/db';
import { assicuraTabelleScenariTriage } from '@/db/provision';
import { PARAMETRI_VUOTI, RANGHI, type ParametriScenari } from './scenari';
import {
  congelaParametri,
  ordinamentoVersioni,
  oggiIso,
  parametriCongelati,
  versioneInVigore,
  type ParametriCongelati,
  type VersioneParametri,
} from './versioniParametri';

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Tutte le versioni, dalla più recente: la scheda dei Parametri. */
export async function leggiVersioniParametri(nomeSchema: string): Promise<VersioneParametri[]> {
  await assicuraTabelleScenariTriage(nomeSchema);
  const r = await pool.query(
    `SELECT v.id, to_char(v.validi_da, 'YYYY-MM-DD') AS validi_da, v.nota,
            v.costi_procedura_pct, to_char(v.creato_il, 'YYYY-MM-DD') AS creata_il,
            r.rango, r.tasso_liquidazione_pct, r.cram_down_pct
       FROM "${nomeSchema}".parametri_scenari_versioni v
       LEFT JOIN "${nomeSchema}".parametri_scenari_versione_ranghi r ON r.versione_id = v.id
      ORDER BY v.validi_da DESC, v.id DESC`
  );
  const perVersione = new Map<
    number,
    {
      id: number;
      validiDa: string;
      nota: string | null;
      creataIl: string | null;
      costi: number | null;
      ranghi: Map<string, { tasso: number | null; cram: number | null }>;
    }
  >();
  for (const riga of r.rows) {
    const id = Number(riga.id);
    let voce = perVersione.get(id);
    if (!voce) {
      voce = {
        id,
        validiDa: String(riga.validi_da),
        nota: riga.nota ?? null,
        creataIl: riga.creata_il ?? null,
        costi: numero(riga.costi_procedura_pct),
        ranghi: new Map(),
      };
      perVersione.set(id, voce);
    }
    if (riga.rango)
      voce.ranghi.set(String(riga.rango), {
        tasso: numero(riga.tasso_liquidazione_pct),
        cram: numero(riga.cram_down_pct),
      });
  }
  return [...perVersione.values()]
    .map((v) => ({
      id: v.id,
      validiDa: v.validiDa,
      nota: v.nota,
      creataIl: v.creataIl,
      parametri: {
        costiProceduraPct: v.costi,
        // L'ordine è quello dei ranghi, non quello del database.
        ranghi: RANGHI.map((r) => ({
          rango: r.codice,
          tassoLiquidazionePct: v.ranghi.get(r.codice)?.tasso ?? null,
          cramDownPct: v.ranghi.get(r.codice)?.cram ?? null,
        })),
      },
    }))
    .sort(ordinamentoVersioni);
}

/** La tabella storica: le percentuali correnti dello spazio. */
export async function leggiParametriCorrenti(nomeSchema: string): Promise<ParametriScenari> {
  try {
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
      costiProceduraPct: numero(config.rows[0]?.costi_procedura_pct),
      ranghi: RANGHI.map((r) => {
        const salvata = perRango.get(r.codice);
        return {
          rango: r.codice,
          tassoLiquidazionePct: numero(salvata?.tasso_liquidazione_pct),
          cramDownPct: numero(salvata?.cram_down_pct),
        };
      }),
    };
  } catch {
    return PARAMETRI_VUOTI;
  }
}

export interface ParametriALlaData {
  versioni: VersioneParametri[];
  versione: VersioneParametri | null;
  parametri: ParametriScenari;
}

/**
 * Le percentuali in vigore in un giorno. Se nessuna versione copre quella data
 * — uno spazio che ha solo i parametri storici — valgono quelli, con
 * `versione: null`: chi mostra il dato può dire che non c'è una versione.
 */
export async function leggiParametriAllaData(
  nomeSchema: string,
  dataRiferimento: string | null = null
): Promise<ParametriALlaData> {
  const giorno = dataRiferimento ?? oggiIso();
  const versioni = await leggiVersioniParametri(nomeSchema).catch(() => [] as VersioneParametri[]);
  const versione = versioneInVigore(versioni, giorno);
  if (versione) return { versioni, versione, parametri: versione.parametri };
  return {
    versioni,
    versione: null,
    parametri: await leggiParametriCorrenti(nomeSchema),
  };
}

/** L'istantanea da scrivere su un documento che si chiude adesso. */
export async function istantaneaParametriInVigore(
  nomeSchema: string,
  giorno: string = oggiIso()
): Promise<ParametriCongelati | null> {
  const { versione } = await leggiParametriAllaData(nomeSchema, giorno).catch(() => ({
    versione: null,
  }));
  return congelaParametri(versione, giorno);
}

/** L'istantanea salvata su una riga (colonna JSONB `parametri_versione`). */
export function leggiCongelati(valore: unknown): ParametriCongelati | null {
  return parametriCongelati(valore);
}

/**
 * L'istantanea dell'ultima verifica dell'azienda: una verifica chiusa conserva
 * le percentuali con cui è nata, anche se l'ente le ha cambiate dopo.
 */
export async function leggiParametriVerificaAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<ParametriCongelati | null> {
  try {
    const r = await pool.query(
      `SELECT parametri_versione FROM "${nomeSchema}".verifica_azienda_simulazioni
        WHERE azienda_id = $1 AND parametri_versione IS NOT NULL
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [aziendaId]
    );
    return leggiCongelati(r.rows[0]?.parametri_versione);
  } catch {
    return null;
  }
}
