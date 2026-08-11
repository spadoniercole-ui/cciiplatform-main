// src/lib/proposta/rangoLegale.ts
//
// Famiglie tipiche della liquidazione giudiziale, usate per classificare
// ogni singola riga della proposta — non la categoria di creditore (che
// resta "chi è" il creditore): uno stesso creditore, es. una banca, può
// avere righe con ranghi diversi a seconda del singolo credito (un
// finanziamento ipotecario e uno chirografario verso la stessa banca).
// Classificazione di legge, non personalizzabile per spazio.

export type RangoLegale =
  | 'PREDEDUCIBILE'
  | 'PRIVILEGIATO_IPOTECA'
  | 'PRIVILEGIATO_GENERALE'
  | 'PRIVILEGIATO'
  | 'CHIROGRAFARIO'
  | 'POSTERGATO';

export const RANGHI_LEGALI: { valore: RangoLegale; etichetta: string }[] = [
  { valore: 'PREDEDUCIBILE', etichetta: 'Prededucibile' },
  { valore: 'PRIVILEGIATO_IPOTECA', etichetta: 'Privilegiato — assistito da ipoteca' },
  { valore: 'PRIVILEGIATO_GENERALE', etichetta: 'Privilegiato — privilegio generale' },
  { valore: 'PRIVILEGIATO', etichetta: 'Privilegiato — non specificato' },
  { valore: 'CHIROGRAFARIO', etichetta: 'Chirografario' },
  { valore: 'POSTERGATO', etichetta: 'Postergato' },
];

export function etichettaRango(rango: RangoLegale | null | undefined): string {
  if (!rango) return 'Non classificato';
  return RANGHI_LEGALI.find((r) => r.valore === rango)?.etichetta || rango;
}

export interface RigaConRango {
  categoriaCreditore: string;
  importoDovuto: number;
  percentualeOfferta: number;
  rangoLegale: RangoLegale | null;
}

export interface RiepilogoRango {
  rango: RangoLegale | null;
  etichetta: string;
  numeroRighe: number;
  totaleDovuto: number;
  totaleOfferto: number;
  creditori: string[];
}

/** Somma le righe della proposta per rango legale — la rappresentazione richiesta in fase di reportistica. */
export function raggruppaPerRango(righe: RigaConRango[]): RiepilogoRango[] {
  const mappa = new Map<string, RiepilogoRango>();
  for (const r of righe) {
    const chiave = r.rangoLegale || '__nessuno__';
    if (!mappa.has(chiave)) {
      mappa.set(chiave, {
        rango: r.rangoLegale,
        etichetta: etichettaRango(r.rangoLegale),
        numeroRighe: 0,
        totaleDovuto: 0,
        totaleOfferto: 0,
        creditori: [],
      });
    }
    const voce = mappa.get(chiave)!;
    voce.numeroRighe += 1;
    voce.totaleDovuto += r.importoDovuto;
    voce.totaleOfferto += (r.importoDovuto * r.percentualeOfferta) / 100;
    if (!voce.creditori.includes(r.categoriaCreditore)) voce.creditori.push(r.categoriaCreditore);
  }
  // Ordine legale: prededucibili prima, chirografari e postergati per ultimi.
  const ordine: (RangoLegale | null)[] = [
    'PREDEDUCIBILE',
    'PRIVILEGIATO_IPOTECA',
    'PRIVILEGIATO_GENERALE',
    'PRIVILEGIATO',
    'CHIROGRAFARIO',
    'POSTERGATO',
    null,
  ];
  return Array.from(mappa.values()).sort(
    (a, b) => ordine.indexOf(a.rango) - ordine.indexOf(b.rango)
  );
}
