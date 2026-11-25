// LA LETTURA DELLA VERIFICA AZIENDA, SENZA EFFETTI (0.242.0).
//
// Fino alla 0.241.0 la composizione della fotografia viveva dentro l'azione
// `calcolaVerificaAziendaAction`, che la legge e poi salva una riga in
// `verifica_azienda_simulazioni`. Chiunque avesse bisogno della stessa
// fotografia — la pagina della Posizione, un confronto, un documento unico —
// doveva o richiamare l'azione (e quindi scrivere una riga a ogni apertura) o
// rifare il calcolo per conto suo, cioè la strada che la 0.240.0 ha chiuso.
//
// Qui c'è la sola lettura: bilanci, asse contabile, rango, percentuali per
// rango, credito memorizzato, nota integrativa. La scrittura resta all'azione.
// Una fotografia, un solo posto che la compone.

import { pool } from '@/lib/db';
import { leggiAperturaVerifica } from '@/lib/verificheApertura';
import { componiProiezione, type PonteEnte } from '@/lib/contabile/proiezione';
import { assicuraTabelleScenariTriage } from '@/db/provision';
import {
  componiFotografia,
  type FotografiaVerificaAzienda,
} from '@/lib/verificaAzienda/fotografia';
import { RANGHI, type ParametriScenari, type RangoCredito } from '@/lib/triage/scenari';
import { leggiDebitoEnteMemorizzato } from '@/lib/debitiEnte/memorizzaDebitoEnte';
import { selezionaNote, type SezioneNota } from '@/lib/xbrl/note';
import type { DatiFinanziariPeriodo, FactTestuale } from '@/lib/xbrl/types';

export interface DebitoVerificaAzienda {
  totale: number;
  memorizzatoIl: string | null;
  fonte: string;
}

export interface AsseContabileVerificaAzienda {
  annoBase: number | null;
  annoUltimoBilancio: number | null;
  annoVerifica: number;
  /** Gli anni costruiti dai differenziali sulla base: etichettati «calcolato». */
  annualitaCalcolate: number[];
}

export interface RiepilogoNota {
  anno: number | null;
  sezioni: string[];
  continuita: string | null;
  piani: string | null;
}

export interface LetturaVerificaAzienda {
  fotografia: FotografiaVerificaAzienda;
  debito: DebitoVerificaAzienda | null;
  nota: RiepilogoNota | null;
  asse: AsseContabileVerificaAzienda;
  /** Il ponte fra il debito dichiarato e quello accertato: serve all'interpolazione. */
  ponte: PonteEnte | null;
}

/** La nota integrativa dell'ultimo bilancio, ridotta a ciò che serve: sezioni e due testi. */
export function riepilogaNota(fatti: unknown, anno: number | null): RiepilogoNota | null {
  if (!Array.isArray(fatti) || fatti.length === 0) return null;
  const note = selezionaNote(fatti as FactTestuale[]);
  const testo = (sezione: SezioneNota): string | null => {
    const trovato = note.fatti.find((f) => f.sezione === sezione);
    return trovato ? trovato.testo.slice(0, 600) : null;
  };
  return {
    anno,
    sezioni: note.sezioni.map((s) => s.sezione),
    continuita: testo('CONTINUITA'),
    piani: testo('PIANI'),
  };
}

/**
 * Il rango del credito scelto nel triage dell'azienda. Una tabella assente o un
 * rango non riconosciuto valgono «non scelto»: le percentuali per rango non si
 * applicano, e la fotografia lo dice.
 */
async function leggiRangoAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<RangoCredito | null> {
  try {
    await assicuraTabelleScenariTriage(nomeSchema);
    const r = await pool.query(
      `SELECT rango FROM "${nomeSchema}".triage_scenario WHERE azienda_id = $1`,
      [aziendaId]
    );
    const codice = r.rows[0]?.rango ? String(r.rows[0].rango) : null;
    return RANGHI.find((x) => x.codice === codice)?.codice ?? null;
  } catch {
    return null;
  }
}

/**
 * LA SOGLIA DI RISCONTRO DELLA PROPOSTA (0.256.20). È la percentuale minima del
 * debito che un eventuale accordo deve rispettare: sta nei Parametri di Spazio,
 * tabella dei riscontri della proposta (`limiti_ricevibilita.percentuale_minima`),
 * una riga per categoria di creditore — e le righe legate a un ente dell'art.
 * 25-novies sono quelle del nostro ente.
 *
 * Fino alla 0.256.19 qui si leggeva la media proposta del Redigente (30% di
 * default): quella pre-compila le righe della proposta, non dice quanto deve
 * offrire il debitore per essere riscontrato.
 *
 * Se le categorie dell'ente portano soglie diverse, non se ne sceglie una: si
 * resta senza soglia e la riga dell'accordo si dichiara non calcolabile. Se
 * l'ente non ha righe sue, valgono tutte quelle dello spazio (una sola soglia
 * comune); se nemmeno così la soglia è unica, resta null.
 */
async function leggiSogliaRiscontro(nomeSchema: string): Promise<number | null> {
  try {
    const r = await pool.query(
      `SELECT percentuale_minima, ente_25novies FROM "${nomeSchema}".limiti_ricevibilita`
    );
    const righe = r.rows
      .map((x) => ({
        pct: x.percentuale_minima === null ? null : Number(x.percentuale_minima),
        ente: x.ente_25novies ? String(x.ente_25novies).trim().length > 0 : false,
      }))
      .filter(
        (x): x is { pct: number; ente: boolean } =>
          x.pct !== null && Number.isFinite(x.pct) && x.pct >= 0 && x.pct <= 100
      );
    const ente = righe.filter((x) => x.ente);
    const scelte = ente.length > 0 ? ente : righe;
    const distinte = [...new Set(scelte.map((x) => x.pct))];
    return distinte.length === 1 ? distinte[0] : null;
  } catch {
    return null;
  }
}

/**
 * Le percentuali per rango fissate dall'ente. Nessun default: una riga
 * mancante resta null e lo scenario si dichiara non calcolabile.
 */
async function leggiParametriScenari(nomeSchema: string): Promise<ParametriScenari> {
  const vuoti: ParametriScenari = {
    costiProceduraPct: null,
    ranghi: RANGHI.map((r) => ({
      rango: r.codice,
      tassoLiquidazionePct: null,
      cramDownPct: null,
    })),
  };
  try {
    await assicuraTabelleScenariTriage(nomeSchema);
    const [config, righe] = await Promise.all([
      pool.query(`SELECT costi_procedura_pct FROM "${nomeSchema}".parametri_scenari WHERE id = 1`),
      pool.query(
        `SELECT rango, tasso_liquidazione_pct, cram_down_pct
           FROM "${nomeSchema}".parametri_scenari_rango`
      ),
    ]);
    const num = (v: unknown): number | null =>
      v === null || v === undefined || v === '' ? null : Number(v);
    const perRango = new Map(righe.rows.map((r) => [String(r.rango), r]));
    return {
      costiProceduraPct: num(config.rows[0]?.costi_procedura_pct),
      ranghi: RANGHI.map((r) => {
        const salvata = perRango.get(r.codice);
        return {
          rango: r.codice,
          tassoLiquidazionePct: num(salvata?.tasso_liquidazione_pct),
          cramDownPct: num(salvata?.cram_down_pct),
        };
      }),
    };
  } catch {
    return vuoti;
  }
}

/**
 * La fotografia dell'azienda alla data della verifica, con i tre scenari.
 * Non scrive nulla: l'unica scrittura della verifica azienda è la riga che
 * ScenariManager legge, e la fa l'azione.
 */
export async function leggiVerificaAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<LetturaVerificaAzienda> {
  const bilancioRis = await pool.query(
    `SELECT anno_bilancio, dati_finanziari FROM "${nomeSchema}".xbrl_storico_azienda
      WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL
      ORDER BY anno_bilancio ASC`,
    [aziendaId]
  );
  const bilanci = bilancioRis.rows
    .map((r) => ({
      anno: Number(r.anno_bilancio),
      dati: r.dati_finanziari as DatiFinanziariPeriodo,
    }))
    .filter((a) => Number.isInteger(a.anno) && a.dati);

  // L'asse temporale è quello della contabile: la serie si ferma all'anno in
  // cui la verifica contabile è stata aperta. La verifica azienda non
  // aggiunge annualità sue.
  const aperturaContabile = await leggiAperturaVerifica(nomeSchema, aziendaId, 'CONTABILE');
  const annoVerifica = aperturaContabile
    ? Number(aperturaContabile.slice(0, 4))
    : new Date().getFullYear();

  // Il credito vantato è il debito accertato nell'amministrativa. Si legge
  // prima dell'asse: la contabile chiude la voce dell'ente sullo stesso stock.
  const memorizzato = await leggiDebitoEnteMemorizzato(nomeSchema, aziendaId);
  const debito = memorizzato
    ? {
        totale: memorizzato.debito.totale,
        memorizzatoIl: memorizzato.memorizzatoIl,
        fonte: memorizzato.debito.fonte,
      }
    : null;

  const asseContabile = componiProiezione({
    bilanci,
    annoVerifica,
    debitoEnte: memorizzato
      ? {
          totale: memorizzato.debito.totale,
          fonte: memorizzato.debito.fonte,
          accertatoIl: memorizzato.memorizzatoIl,
        }
      : null,
  });

  const [rango, parametri, sogliaRiscontro] = await Promise.all([
    leggiRangoAzienda(nomeSchema, aziendaId),
    leggiParametriScenari(nomeSchema),
    leggiSogliaRiscontro(nomeSchema),
  ]);

  const fotografia = componiFotografia({
    proiezione: asseContabile,
    credito: debito?.totale ?? null,
    rango,
    parametri,
    sogliaRiscontro,
  });

  // La nota integrativa dell'ultimo bilancio: si mostra accanto alla
  // fotografia, non diventa un tasso. Se i bilanci non la portano, non è un
  // errore.
  let nota: RiepilogoNota | null = null;
  try {
    const notaRis = await pool.query(
      `SELECT anno_bilancio, note_fatti FROM "${nomeSchema}".xbrl_storico_azienda
        WHERE azienda_id = $1 AND note_fatti IS NOT NULL
        ORDER BY anno_bilancio DESC NULLS LAST
        LIMIT 1`,
      [aziendaId]
    );
    const riga = notaRis.rows[0];
    if (riga) {
      nota = riepilogaNota(
        riga.note_fatti,
        riga.anno_bilancio === null || riga.anno_bilancio === undefined
          ? null
          : Number(riga.anno_bilancio)
      );
    }
  } catch {
    nota = null;
  }

  return {
    fotografia,
    debito,
    nota,
    ponte: asseContabile.ponteEnte,
    asse: {
      annoBase: asseContabile.annoBase,
      annoUltimoBilancio: asseContabile.annoUltimoBilancio,
      annoVerifica,
      annualitaCalcolate: asseContabile.annualitaCalcolate,
    },
  };
}
