// src/lib/triage/rapportoEnte.ts
//
// IL PARAMETRO ATTESO DALL'ENTE, SCRITTO NEL REPORT (0.159.0).
//
// Il confronto con gli scenari dice quanto l'ente recupererebbe in
// liquidazione e in cram down. Non dice l'unica cosa che l'ente vuole sapere:
// quanto di quel recupero si scosta da ciò che l'ente considera dovuto. Per
// l'INPS la percentuale attesa è il 100% del credito; per un altro ente è un
// altro numero, fissato da chi configura lo spazio.
//
// DUE RIGHE, NON UN GIOCCHINO. Il risultato non è una levetta da muovere a
// video: sono due importi — X in liquidazione, Y in cram down — che finiscono
// nel report accanto all'esposizione dell'ente, con la categoria di debito da
// cui vengono. A video resta la lettura del dato, non una simulazione.
//
// SOLO IL CREDITO DELL'ENTE. Non si chiede quanta parte sia privilegiata e
// quanta chirografaria degli altri creditori: quel dettaglio non cambia il
// valore di questo dato, che misura una sola cosa — quanto l'ente incassa, in
// due ipotesi, sul proprio credito. Le categorie dei debiti dell'ente restano
// visibili perché dicono come quel credito è composto.
//
// Logica pura, con i suoi test.

import type { ParametriScenari, RangoCredito } from './scenari';

export interface DebitoEnteCategoria {
  /** Etichetta della categoria di debito dell'ente (es. «Contributi», «Sanzioni»). */
  categoria: string;
  /** Saldo dovuto dall'azienda all'ente in quella categoria. */
  dovuto: number;
  /** Rango del credito dell'ente: null = non ancora dichiarato. */
  rango: RangoCredito | null;
}

export interface RigaRapportoEnte {
  categoria: string;
  rango: RangoCredito | null;
  dovuto: number;
  atteso: number;
  liquidazione: number | null;
  cramDown: number | null;
  /** Recupero meno atteso: negativo = l'ente incassa meno di quanto pretende. */
  scostamentoLiquidazione: number | null;
  scostamentoCramDown: number | null;
  calcolabile: boolean;
  motivo: string | null;
}

export interface RapportoEnte {
  righe: RigaRapportoEnte[];
  percentualeAttesa: number | null;
  totaleDovuto: number;
  totaleAtteso: number | null;
  totaleLiquidazione: number | null;
  totaleCramDown: number | null;
  scostamentoLiquidazione: number | null;
  scostamentoCramDown: number | null;
  calcolabile: boolean;
  mancanti: string[];
}

const pctValida = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;

const euro = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcola le due righe del report. `percentualeAttesa` è la quota del
 * proprio credito che l'ente considera dovuta (per l'INPS, 100): senza,
 * il confronto con l'atteso non esiste e la tabella lo dichiara, invece di
 * prendere 100 come se fosse una regola di legge.
 */
export function rapportoEnte(input: {
  righe: DebitoEnteCategoria[];
  parametri: ParametriScenari;
  percentualeAttesaPct: number | null;
}): RapportoEnte {
  const percentualeAttesa = pctValida(input.percentualeAttesaPct);
  const costiPct = pctValida(input.parametri.costiProceduraPct);
  const mancanti: string[] = [];
  if (input.righe.length === 0) mancanti.push('le categorie di debito dell’ente');
  if (percentualeAttesa === null) mancanti.push('la percentuale attesa dall’ente');

  const righe: RigaRapportoEnte[] = input.righe.map((r) => {
    const rigaParametri = r.rango
      ? (input.parametri.ranghi.find((p) => p.rango === r.rango) ?? null)
      : null;
    const tasso = pctValida(rigaParametri?.tassoLiquidazionePct);
    const cram = pctValida(rigaParametri?.cramDownPct);
    const motivi: string[] = [];
    if (!r.rango) motivi.push('il rango del credito dell’ente non è indicato');
    else if (!rigaParametri) motivi.push('il rango non è configurato nei parametri');
    if (tasso === null) motivi.push('manca il tasso di realizzo per il rango');
    if (costiPct === null) motivi.push('mancano le spese di procedura');
    if (cram === null) motivi.push('manca la percentuale di cram down per il rango');

    const liquidazione =
      tasso !== null && costiPct !== null
        ? euro(((r.dovuto * tasso) / 100) * (1 - costiPct / 100))
        : null;
    const cramDown = cram !== null ? euro((r.dovuto * cram) / 100) : null;
    const atteso = percentualeAttesa !== null ? euro((r.dovuto * percentualeAttesa) / 100) : null;

    return {
      categoria: r.categoria,
      rango: r.rango,
      dovuto: euro(r.dovuto),
      atteso: atteso ?? 0,
      liquidazione,
      cramDown,
      scostamentoLiquidazione:
        atteso !== null && liquidazione !== null ? euro(liquidazione - atteso) : null,
      scostamentoCramDown: atteso !== null && cramDown !== null ? euro(cramDown - atteso) : null,
      calcolabile: motivi.length === 0 && atteso !== null,
      motivo: motivi.length > 0 ? motivi.join('; ') : null,
    };
  });

  for (const r of righe) if (r.motivo && !mancanti.includes(r.motivo)) mancanti.push(r.motivo);

  const totaleDovuto = euro(righe.reduce((a, r) => a + r.dovuto, 0));
  const tutte = righe.length > 0 && righe.every((r) => r.calcolabile);
  const somma = (chiave: 'liquidazione' | 'cramDown' | 'atteso') =>
    tutte ? euro(righe.reduce((a, r) => a + (r[chiave] ?? 0), 0)) : null;

  const totaleAtteso = somma('atteso');
  const totaleLiquidazione = somma('liquidazione');
  const totaleCramDown = somma('cramDown');

  return {
    righe,
    percentualeAttesa,
    totaleDovuto,
    totaleAtteso,
    totaleLiquidazione,
    totaleCramDown,
    scostamentoLiquidazione:
      totaleAtteso !== null && totaleLiquidazione !== null
        ? euro(totaleLiquidazione - totaleAtteso)
        : null,
    scostamentoCramDown:
      totaleAtteso !== null && totaleCramDown !== null ? euro(totaleCramDown - totaleAtteso) : null,
    calcolabile: tutte,
    mancanti,
  };
}
