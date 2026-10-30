// src/lib/soglie25novies/rapportoAnni.ts
//
// IL RAPPORTO CONTRIBUTI SCADUTI / DOVUTI, ANNO PER ANNO.
//
// La soglia dell'art. 25-novies, comma 1, lett. a) confronta due grandezze
// che vengono da due file diversi dell'istituto:
//
//   - i contributi DOVUTI, dal saldo delle denunce (DM10 / UNIEMENS), che il
//     file scrive periodo per periodo, quindi si sommano per anno;
//   - i contributi SCADUTI e non versati, dalla Lista Inadempienze, che il
//     file scrive partita per partita, con il periodo di competenza.
//
// Finora di questi due numeri si conservava solo l'ultimo: il dovuto
// dell'anno precedente e lo scaduto di oggi. Il resto veniva letto e
// buttato, così il rapporto si poteva leggere in un solo istante — quello
// del triage — e non lungo il tempo. Ma la domanda che si fa a un'azienda
// non è «quanto devi oggi»: è «da quando». Un rapporto che sale dal 12% al
// 34% racconta una storia diversa da un 34% stabile da tre anni, e la
// differenza sta nella serie, non nell'ultimo punto.
//
// QUI SI CALCOLA SOLO IL RAPPORTO. Non è il test della norma: quello
// richiede anche il ritardo di oltre 90 giorni e, con lavoratori, i 15.000
// euro. Una quota sopra il 30% non è una soglia superata, ed è per questo
// che il campo si chiama `oltreQuota` e non `violato`: il semaforo resta in
// `calcolo.ts`, dove i requisiti sono congiunti.
//
// NIENTE ZERI INVENTATI. Un anno presente in un file e assente nell'altro
// resta con il lato mancante a null: il rapporto non si calcola. Sul caso
// reale del 2022 il DM10 porta il dovuto e le inadempienze non portano
// nulla, e scrivere «0 su 385.200» direbbe che l'azienda era in regola
// mentre il file semplicemente non copriva quella partita.

import { SOGLIE_25NOVIES } from './calcolo';

/** I due lati del rapporto per un anno. `null` = il file non ne parla. */
export interface ContributiAnno {
  anno: number;
  dovuti: number | null;
  scaduti: number | null;
}

export interface RapportoAnno extends ContributiAnno {
  /** scaduti / dovuti, in forma decimale (0.34 = 34%); null se non calcolabile. */
  quota: number | null;
  /** La quota supera il 30%: NON è la soglia dell'art. 25-novies. */
  oltreQuota: boolean | null;
}

/**
 * Unisce i due anni letti dai file in una serie unica, ordinata.
 *
 * Un anno che compare in uno solo dei due file entra lo stesso, con l'altro
 * lato a null: è un'informazione (il file esisteva ma non copriva l'anno),
 * non un dato da scartare.
 */
export function unisciContributiPerAnno(
  dovuti: Record<number, number>,
  scaduti: Record<number, number>
): ContributiAnno[] {
  const anni = new Set<number>([...Object.keys(dovuti), ...Object.keys(scaduti)].map(Number));
  return [...anni]
    .filter((a) => Number.isFinite(a))
    .sort((a, b) => a - b)
    .map((anno) => ({
      anno,
      dovuti: Number.isFinite(dovuti[anno]) ? dovuti[anno] : null,
      scaduti: Number.isFinite(scaduti[anno]) ? scaduti[anno] : null,
    }));
}

/**
 * Il rapporto per ciascun anno, con la quota di legge.
 *
 * Con dovuti a zero o negativi il rapporto non esiste — dividere darebbe
 * infinito, e mostrarlo come «oltre soglia» sarebbe un errore di segno
 * opposto a quello che i dati dicono.
 */
export function rapportiPerAnno(
  anni: readonly ContributiAnno[],
  sogliaQuota: number = SOGLIE_25NOVIES.inpsPercentuale
): RapportoAnno[] {
  return [...anni]
    .sort((a, b) => a.anno - b.anno)
    .map(({ anno, dovuti, scaduti }) => {
      if (dovuti === null || scaduti === null || !(dovuti > 0))
        return { anno, dovuti, scaduti, quota: null, oltreQuota: null };
      const quota = scaduti / dovuti;
      return { anno, dovuti, scaduti, quota, oltreQuota: quota > sogliaQuota };
    });
}

/**
 * Lettura difensiva del valore JSON salvato in `aziende.contributi_per_anno`.
 *
 * Il driver Postgres può restituire l'oggetto già decodificato oppure la
 * stringa: entrambe le forme sono normali, e un valore illeggibile deve
 * produrre una serie vuota — non un errore che blocca la scheda Indici.
 */
export function contributiPerAnnoDaDb(valore: unknown): ContributiAnno[] {
  let dati: unknown = valore;
  if (typeof dati === 'string') {
    try {
      dati = JSON.parse(dati);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(dati)) return [];
  const numero = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const out: ContributiAnno[] = [];
  for (const riga of dati) {
    const r = riga as Record<string, unknown>;
    const anno = numero(r?.anno);
    if (anno === null || anno < 1990 || anno > 2100) continue;
    out.push({ anno, dovuti: numero(r.dovuti), scaduti: numero(r.scaduti) });
  }
  return out.sort((a, b) => a.anno - b.anno);
}
