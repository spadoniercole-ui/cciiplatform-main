// src/lib/piano/pianoDaVerifica.ts
//
// IL PIANO DELL'AZIENDA CHE ARRIVA DALLA VERIFICA AZIENDALE — il passo 3, il
// prospetto con le annualità costruite.
//
// Quando lo scenario nasce con il flag di simulazione, il piano di sviluppo non
// parte dal nulla: l'azienda ha già messo a disposizione una proiezione nella
// verifica aziendale, salvata come fotografia/prospetto (`colonne`: gli anni
// depositati con tipo STORICO e quelli costruiti con tipo CALCOLATO). Quella è
// la base che l'AI deve leggere, e che il piano simulato non può contraddire
// senza dirlo.
//
// NON SI RICALCOLA NULLA: i valori arrivano dal salvataggio della verifica, e
// qui si portano in testo. Una voce non letta resta «non letta», non zero.
//
// Funzione pura, con i suoi test.

export interface AnnoPianoVerifica {
  anno: number;
  /** «STORICO» per gli anni depositati, «CALCOLATO» per quelli costruiti. */
  tipo: string;
  ricavi: number | null;
  utile: number | null;
  patrimonioNetto: number | null;
  totaleDebiti: number | null;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Le annualità del prospetto della verifica aziendale, nell'ordine in cui sono
 * state salvate. Una colonna senza anno non si può collocare e resta fuori.
 */
export function pianoVerificaDaColonne(colonne: unknown): AnnoPianoVerifica[] {
  if (!Array.isArray(colonne)) return [];
  return colonne
    .map((c) => {
      const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      const dati = (o.dati && typeof o.dati === 'object' ? o.dati : {}) as Record<string, unknown>;
      return {
        anno: numero(o.anno) ?? 0,
        tipo: String(o.tipo ?? 'STORICO'),
        ricavi: numero(dati.ricaviVendite),
        utile: numero(dati.utileEsercizio),
        patrimonioNetto: numero(dati.patrimonioNetto),
        totaleDebiti: numero(dati.totaleDebiti),
      };
    })
    .filter((a) => a.anno > 1900);
}

const euro = (n: number | null) => (n === null ? 'non letto' : `${Math.round(n)} €`);

/**
 * Il blocco per il prompt. Vuoto quando non ci sono annualità: chi chiama non
 * deve decidere se aggiungerlo.
 */
export function testoPianoVerifica(anni: AnnoPianoVerifica[]): string {
  if (anni.length === 0) return '';
  return anni
    .map(
      (a) =>
        `- ${a.anno} (${a.tipo === 'CALCOLATO' ? 'costruito dalla verifica' : 'depositato'}): ricavi ${euro(
          a.ricavi
        )}; utile ${euro(a.utile)}; patrimonio netto ${euro(a.patrimonioNetto)}; debiti ${euro(
          a.totaleDebiti
        )}`
    )
    .join('\n');
}

/** L'ultimo anno del prospetto: è il punto da cui il piano simulato riparte. */
export function ultimoAnnoVerifica(anni: AnnoPianoVerifica[]): number | null {
  if (anni.length === 0) return null;
  return anni.reduce((max, a) => (a.anno > max ? a.anno : max), anni[0].anno);
}
