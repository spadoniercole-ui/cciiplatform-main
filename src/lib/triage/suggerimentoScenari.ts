// src/lib/triage/suggerimentoScenari.ts
//
// LA PROPOSTA DELLA RICERCA WEB, RIDOTTA A DATI SICURI (0.169.0).
//
// La ricerca non salva nulla: propone le percentuali all'ente, che le
// controlla e le firma. Perché la proposta sia leggibile serve sapere DA DOVE
// viene ogni numero. Un tasso di realizzo preso da una statistica del
// Ministero e uno ricavato da dieci omologazioni sono entrambi utili, ma non
// sono la stessa cosa: il primo è un dato osservato, il secondo è una stima da
// casistica e va dichiarato come tale.
//
// LA RICERCA NON SI FERMA AL PRIMO VUOTO. Quando la statistica ufficiale non
// copre un rango, la strada è la casistica — provvedimenti di omologazione,
// relazioni dei commissari, osservatori, prassi dei tribunali — non il silenzio.
// Il valore che ne esce resta una stima, e la piattaforma lo dice invece di
// farlo passare per un dato certo.
//
// Logica pura: il parsing e la validazione stanno qui, con i loro test; la
// server action si limita a chiamare il modello e a passare la risposta.

import { RANGHI, type ParametriScenari, type RangoCredito } from './scenari';

/** Da dove viene il valore proposto. */
export type BaseSuggerimento =
  'DATO_UFFICIALE' | 'CASISTICA' | 'PRASSI' | 'MISTA' | 'NON_DICHIARATA';

export const ETICHETTA_BASE: Record<BaseSuggerimento, string> = {
  DATO_UFFICIALE: 'Dato ufficiale',
  CASISTICA: 'Stima da casistica',
  PRASSI: 'Prassi dei tribunali',
  MISTA: 'Dati ufficiali e casistica',
  NON_DICHIARATA: 'Base non dichiarata',
};

/** La casistica non è un dato osservato: l'interfaccia lo deve dire. */
export function baseDaValidare(base: BaseSuggerimento): boolean {
  return base !== 'DATO_UFFICIALE';
}

export interface FonteSuggerimento {
  titolo: string;
  url: string;
}

export interface SuggerimentoScenari {
  parametri: ParametriScenari;
  note: string;
  fonti: FonteSuggerimento[];
  base: BaseSuggerimento;
}

/**
 * Le varianti che un modello può restituire per la stessa idea.
 *
 * Non si pretende che indovini la nostra enumerazione: «statistica
 * ministeriale», «case history», «best practice» sono tutte risposte
 * legittime, e ricondurle alla base giusta è più utile che scartarle.
 */
export function normalizzaBase(valore: unknown): BaseSuggerimento {
  const testo = String(valore ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!testo) return 'NON_DICHIARATA';
  if (testo.includes('MIST') || testo.includes('MIX')) return 'MISTA';
  if (testo.includes('UFFICIAL') || testo.includes('STATISTIC') || testo.includes('ISTAT'))
    return 'DATO_UFFICIALE';
  if (testo.includes('CASISTIC') || testo.includes('CASE_HISTORY') || testo.includes('CASE'))
    return 'CASISTICA';
  if (testo.includes('PRASSI') || testo.includes('BEST') || testo.includes('TRIBUNAL'))
    return 'PRASSI';
  return 'NON_DICHIARATA';
}

const percentuale = (v: unknown): number | null => {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && v.trim() !== ''
        ? Number(v.replace(',', '.'))
        : Number.NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
};

/**
 * La risposta del modello nella forma che l'interfaccia usa.
 *
 * Tutti i ranghi ci sono sempre, anche quelli che la ricerca non ha coperto:
 * una riga assente dal JSON non deve sparire dalla tabella, altrimenti l'ente
 * non sa che quel rango è rimasto vuoto.
 */
export function leggiSuggerimento(grezzo: Record<string, unknown>): SuggerimentoScenari {
  const righe = Array.isArray(grezzo.ranghi) ? (grezzo.ranghi as Record<string, unknown>[]) : [];
  const parametri: ParametriScenari = {
    costiProceduraPct: percentuale(grezzo.costiProceduraPct),
    ranghi: RANGHI.map((r) => {
      const trovata = righe.find(
        (x) =>
          String(x.rango ?? '')
            .trim()
            .toUpperCase() === r.codice
      );
      return {
        rango: r.codice,
        tassoLiquidazionePct: percentuale(trovata?.tassoLiquidazionePct),
        cramDownPct: percentuale(trovata?.cramDownPct),
      };
    }),
  };

  const fonti: FonteSuggerimento[] = Array.isArray(grezzo.fonti)
    ? (grezzo.fonti as Record<string, unknown>[])
        .map((f) => ({
          titolo: String(f.titolo ?? '').trim(),
          url: String(f.url ?? '').trim(),
        }))
        .filter((f) => /^https?:\/\//i.test(f.url))
        .slice(0, 8)
    : [];

  return {
    parametri,
    note: String(grezzo.note ?? '').trim(),
    fonti,
    base: normalizzaBase(grezzo.base),
  };
}

/** La ricerca ha portato almeno un numero utilizzabile? */
export function haPercentuali(s: SuggerimentoScenari): boolean {
  return (
    s.parametri.costiProceduraPct !== null ||
    s.parametri.ranghi.some((r) => r.tassoLiquidazionePct !== null || r.cramDownPct !== null)
  );
}

/** I ranghi con almeno un valore: servono al messaggio di ritorno. */
export function ranghiCoperti(s: SuggerimentoScenari): RangoCredito[] {
  return s.parametri.ranghi
    .filter((r) => r.tassoLiquidazionePct !== null || r.cramDownPct !== null)
    .map((r) => r.rango);
}
