import { describe, it, expect } from 'vitest';
import { calcolaConfrontoVera } from './confrontoVera';

const CAT = [
  { codice: 'DEBITO', contribuisce: true },
  { codice: 'AVA', contribuisce: true },
  { codice: 'NEUTRO', contribuisce: false },
];

describe('confronto V.E.R.A. vs contabilizzato', () => {
  it('il delta positivo sono le sanzioni presunte', () => {
    const c = calcolaConfrontoVera(
      [{ tipo: 'DEBITO', importo: 10_000 }],
      [{ categoria: 'DEBITO', importo: 13_000, trattamento: 'contabilizzato' }],
      CAT
    );
    expect(c.totaleContabilizzato).toBe(10_000);
    expect(c.totaleVera).toBe(13_000);
    expect(c.sanzioniPresunte).toBe(3_000);
    expect(c.deltaNegativo).toBe(false);
  });

  it('le categorie neutre non concorrono ai totali', () => {
    const c = calcolaConfrontoVera(
      [
        { tipo: 'DEBITO', importo: 10_000 },
        { tipo: 'NEUTRO', importo: 99_000 },
      ],
      [
        { categoria: 'DEBITO', importo: 12_000, trattamento: 'contabilizzato' },
        { categoria: 'NEUTRO', importo: 99_000, trattamento: 'contabilizzato' },
      ],
      CAT
    );
    expect(c.totaleContabilizzato).toBe(10_000);
    expect(c.sanzioniPresunte).toBe(2_000);
  });

  it('le righe "potenziale" non entrano negli importi, ma vengono contate', () => {
    const c = calcolaConfrontoVera(
      [{ tipo: 'DEBITO', importo: 5_000 }],
      [
        { categoria: 'DEBITO', importo: 6_000, trattamento: 'da_contabilizzare' },
        { categoria: 'DEBITO', importo: 0, trattamento: 'potenziale' },
        { categoria: 'DEBITO', importo: 0, trattamento: 'potenziale' },
      ],
      CAT
    );
    expect(c.totaleVera).toBe(6_000);
    expect(c.righePotenziali).toBe(2);
  });

  it('le righe "ignora" sono escluse del tutto', () => {
    const c = calcolaConfrontoVera(
      [{ tipo: 'DEBITO', importo: 5_000 }],
      [
        { categoria: 'DEBITO', importo: 6_000, trattamento: 'da_contabilizzare' },
        { categoria: 'DEBITO', importo: 50_000, trattamento: 'ignora' },
      ],
      CAT
    );
    expect(c.totaleVera).toBe(6_000);
  });

  it('delta negativo: nessuna sanzione presunta, ma la circostanza è segnalata', () => {
    // L'ente ha contabilizzato più di quanto la VERA riporti: disallineamento
    // di perimetro, non una sanzione negativa.
    const c = calcolaConfrontoVera(
      [{ tipo: 'DEBITO', importo: 20_000 }],
      [{ categoria: 'DEBITO', importo: 15_000, trattamento: 'contabilizzato' }],
      CAT
    );
    expect(c.deltaGrezzo).toBe(-5_000);
    expect(c.sanzioniPresunte).toBe(0);
    expect(c.deltaNegativo).toBe(true);
  });

  it('un delta negativo su una categoria non cancella le sanzioni di un’altra nel dettaglio', () => {
    const c = calcolaConfrontoVera(
      [
        { tipo: 'DEBITO', importo: 20_000 },
        { tipo: 'AVA', importo: 1_000 },
      ],
      [
        { categoria: 'DEBITO', importo: 15_000, trattamento: 'contabilizzato' },
        { categoria: 'AVA', importo: 4_000, trattamento: 'contabilizzato' },
      ],
      CAT
    );
    const perCat = Object.fromEntries(c.perCategoria.map((x) => [x.codice, x.delta]));
    expect(perCat.DEBITO).toBe(-5_000);
    expect(perCat.AVA).toBe(3_000);
    // Il totale resta la somma algebrica: −2.000, quindi nessuna sanzione.
    expect(c.deltaGrezzo).toBe(-2_000);
    expect(c.sanzioniPresunte).toBe(0);
  });

  it('le categorie senza alcun importo non compaiono', () => {
    const c = calcolaConfrontoVera([{ tipo: 'DEBITO', importo: 1_000 }], [], CAT);
    expect(c.perCategoria.map((x) => x.codice)).toEqual(['DEBITO']);
  });
});
