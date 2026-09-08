import { describe, it, expect } from 'vitest';

// Logica di divisione e ricomposizione del file in frammenti, verificata
// senza database: è aritmetica su stringhe, e sbagliarla significa ricomporre
// un backup corrotto — indistinguibile, al ripristino, da un file danneggiato.

const DIMENSIONE_FRAMMENTO = 1_500_000;

/** Come fa il browser. */
function dividi(contenuto: string, dimensione = DIMENSIONE_FRAMMENTO): string[] {
  const totale = Math.ceil(contenuto.length / dimensione);
  const pezzi: string[] = [];
  for (let i = 0; i < totale; i++) {
    pezzi.push(contenuto.slice(i * dimensione, (i + 1) * dimensione));
  }
  return pezzi;
}

/** Come fa il server: ordina per indice e concatena. */
function ricomponi(frammenti: { indice: number; contenuto: string }[]): string {
  return [...frammenti]
    .sort((a, b) => a.indice - b.indice)
    .map((f) => f.contenuto)
    .join('');
}

describe('divisione e ricomposizione', () => {
  it('un file torna identico dopo il giro completo', () => {
    const originale = 'A'.repeat(4_000_000) + "L'Officina · àèìòù · \n\t" + 'Z'.repeat(1_000_000);
    const pezzi = dividi(originale);
    const ricomposto = ricomponi(pezzi.map((c, i) => ({ indice: i, contenuto: c })));
    expect(ricomposto).toBe(originale);
    expect(ricomposto.length).toBe(originale.length);
  });

  it('ogni frammento resta sotto il limite della piattaforma', () => {
    const pezzi = dividi('x'.repeat(6_000_000));
    // ~4,5 MB è il limite; 1,5 MB lascia margine per la codifica del
    // protocollo delle Server Action.
    for (const p of pezzi) expect(p.length).toBeLessThanOrEqual(DIMENSIONE_FRAMMENTO);
  });

  it('un file esattamente pari alla dimensione del frammento fa un pezzo solo', () => {
    expect(dividi('x'.repeat(DIMENSIONE_FRAMMENTO))).toHaveLength(1);
  });

  it('un byte in più fa due pezzi, e il secondo contiene quel byte', () => {
    const pezzi = dividi('x'.repeat(DIMENSIONE_FRAMMENTO) + 'Q');
    expect(pezzi).toHaveLength(2);
    expect(pezzi[1]).toBe('Q');
  });

  it('la ricomposizione non dipende dall’ordine di arrivo', () => {
    // Le chiamate possono concludersi in ordine diverso da quello di invio.
    const originale = 'primo|secondo|terzo'; // 19 caratteri → 4 pezzi da 6
    const pezzi = dividi(originale, 6).map((c, i) => ({ indice: i, contenuto: c }));
    expect(pezzi).toHaveLength(4);
    const mescolati = [pezzi[3], pezzi[1], pezzi[0], pezzi[2]];
    expect(ricomponi(mescolati)).toBe(originale);
  });

  it('un file vuoto non produce frammenti', () => {
    expect(dividi('')).toHaveLength(0);
  });
});
