// src/lib/debitiEnte/duplicatiVera.ts
//
// LO STESSO DEBITO SCRITTO DUE VOLTE.
//
// Nel V.E.R.A. la stessa obbligazione può comparire su due righe: il versamento
// non eseguito («F24 non presentato», con la cifra nelle colonne Contributi e
// Sanzioni) e la denuncia non trasmessa («Denunce non trasmesse», con il totale
// nella colonna dell'importo). Sono due facce dello stesso inadempimento — se
// la denuncia non è stata trasmessa, quel versamento non è stato pagato — e il
// file le riporta entrambe, ciascuna con la propria cifra.
//
// Sommarle nell'esposizione conta due volte lo stesso debito verso l'ente. Non
// si può però scartarne una in silenzio: sono due righe distinte, con due stati
// distinti, e la seconda dice qualcosa che la prima non dice (la denuncia va
// trasmessa). Quindi la cifra si conta una volta sola e l'ambiguità si
// dichiara: chi legge deve sapere che quel numero è stato scontato, non
// scoprire da sé che il totale non torna.
//
// IL CRITERIO È STRETTO DI PROPOSITO: stesso periodo di competenza, stesso
// importo al centesimo, e natura «F24» da una parte e «denunce» dall'altra.
// Non è un'euristica sull'ordine delle righe né sulla vicinanza. Senza periodo
// non c'è accoppiamento: senza il periodo non c'è prova che sia lo stesso
// debito, e scontarne una a caso toglierebbe dall'esposizione un debito vero.
//
// QUALE DELLE DUE SI SCONTA. Si tiene la riga F24 e si sconta la denuncia:
// è la riga F24 che porta la quota di contributi, cioè la grandezza su cui si
// misura la soglia dell'art. 25-novies. Scontare l'altra lascerebbe la soglia
// invariata ma l'esposizione composta da una riga che nella base non entra.

import { periodoDaVera } from './veraImport';

/** Il minimo che serve per riconoscere la coppia. */
export interface RigaPerDuplicati {
  voce: string;
  periodo?: string;
  importo: number;
}

export interface DuplicatiVera {
  /**
   * Gli indici — nell'ordine delle righe ricevute — delle righe «denunce» da
   * non sommare: la stessa cifra è già dichiarata dalla riga F24.
   */
  indiciDaNonSommare: number[];
  righe: number;
  totale: number;
  /** I periodi in cui la doppia scrittura compare (AAAA-MM), in ordine. */
  periodi: string[];
}

const QUASI_ZERO = 0.005;

function eF24(voce: string): boolean {
  return /f24/i.test(voce);
}

function eDenunce(voce: string): boolean {
  return /denunc/i.test(voce);
}

function centesimi(importo: number): number {
  return Math.round(importo * 100);
}

/** La chiave dell'accoppiamento: anno e mese di competenza. */
function chiavePeriodo(r: RigaPerDuplicati): string | null {
  const p = r.periodo ? periodoDaVera(r.periodo) : null;
  if (!p) return null;
  return `${p.anno}-${String(p.mese).padStart(2, '0')}`;
}

/**
 * Le righe «denunce» che ripetono un «F24 non presentato» dello stesso periodo
 * e dello stesso importo.
 *
 * L'accoppiamento è uno a uno: due F24 identici e una sola denuncia scontano
 * una denuncia, non due. Restituisce indici, non righe, perché le righe sono
 * oggetti diversi a seconda di chi chiama (triage, documento per reparto,
 * report per unità operativa) e vanno escluse senza essere ricostruite.
 */
export function denunceDuplicateVera(righe: readonly RigaPerDuplicati[]): DuplicatiVera {
  // Le cifre F24 ancora disponibili, per periodo: si consumano una per una.
  const disponibili = new Map<string, number[]>();
  for (const r of righe) {
    if (!eF24(r.voce) || eDenunce(r.voce)) continue;
    const chiave = chiavePeriodo(r);
    const quota = centesimi(r.importo);
    if (chiave === null || quota <= QUASI_ZERO) continue;
    const elenco = disponibili.get(chiave) ?? [];
    elenco.push(quota);
    disponibili.set(chiave, elenco);
  }

  const indiciDaNonSommare: number[] = [];
  const periodi: string[] = [];
  let totale = 0;

  righe.forEach((r, i) => {
    if (!eDenunce(r.voce) || eF24(r.voce)) return;
    const chiave = chiavePeriodo(r);
    const quota = centesimi(r.importo);
    if (chiave === null || quota <= QUASI_ZERO) return;
    const elenco = disponibili.get(chiave);
    if (!elenco) return;
    const pos = elenco.indexOf(quota);
    if (pos < 0) return;
    elenco.splice(pos, 1);
    indiciDaNonSommare.push(i);
    totale += r.importo;
    if (!periodi.includes(chiave)) periodi.push(chiave);
  });

  periodi.sort();
  return { indiciDaNonSommare, righe: indiciDaNonSommare.length, totale, periodi };
}

/** Gli indici come insieme: `righe.filter((_, i) => !esclusi.has(i))`. */
export function insiemeEsclusi(duplicati: DuplicatiVera): Set<number> {
  return new Set(duplicati.indiciDaNonSommare);
}
