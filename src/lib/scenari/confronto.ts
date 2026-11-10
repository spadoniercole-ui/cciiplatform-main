// LE SOVRASCRITTURE DEL TRANSATTIVO (0.196.0).
//
// La base dello scenario è la simulazione salvata nella verifica azienda. Il
// valutatore può sovrascrivere il dato che l'azienda ha fornito, cella per
// cella: ogni scrittura conserva il valore di base, quello inserito e la
// differenza. Non è una correzione silenziosa — è una traccia, e la sua
// statistica serve ad affinare il modello, non a concludere nulla.

export interface Sovrascrittura {
  id?: number;
  anno: number;
  voce: string;
  valoreBase: number;
  valoreInserito: number;
  differenza: number;
  autore?: string | null;
  aggiornataIl?: string | null;
}

export interface StatisticaSovrascritture {
  /** Quante celle sono state sovrascritte. */
  numero: number;
  /** Somma delle differenze in valore assoluto. */
  sommaAssoluta: number;
  /** Differenza media in valore assoluto; zero quando non c'è nulla. */
  mediaAssoluta: number;
  perAnno: { anno: number; numero: number; sommaAssoluta: number }[];
}

export const arrotonda2 = (n: number): number => {
  const arrotondato = Math.round(n * 100) / 100;
  // Il round di un valore negativo vicino a zero produce -0: a video è zero,
  // ma nei confronti e nei test non lo è.
  return Object.is(arrotondato, -0) ? 0 : arrotondato;
};

export function differenza(valoreBase: number, valoreInserito: number): number {
  return arrotonda2(valoreInserito - valoreBase);
}

export function riepilogaSovrascritture(righe: Sovrascrittura[]): StatisticaSovrascritture {
  const perAnno = new Map<number, { numero: number; sommaAssoluta: number }>();
  let sommaAssoluta = 0;

  for (const riga of righe) {
    const assoluta = Math.abs(riga.differenza);
    sommaAssoluta += assoluta;
    const voce = perAnno.get(riga.anno) ?? { numero: 0, sommaAssoluta: 0 };
    voce.numero += 1;
    voce.sommaAssoluta = arrotonda2(voce.sommaAssoluta + assoluta);
    perAnno.set(riga.anno, voce);
  }

  return {
    numero: righe.length,
    sommaAssoluta: arrotonda2(sommaAssoluta),
    mediaAssoluta: righe.length > 0 ? arrotonda2(sommaAssoluta / righe.length) : 0,
    perAnno: [...perAnno.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([anno, voce]) => ({ anno, ...voce })),
  };
}
