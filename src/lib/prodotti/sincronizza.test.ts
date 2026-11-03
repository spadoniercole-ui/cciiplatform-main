import { describe, expect, it } from 'vitest';
import { sincronizzaDirettrici } from './sincronizza';

describe('sincronizzaDirettrici', () => {
  it('porta i prodotti della tabella dentro i nomi già scritti, senza cambiarne l’ordine', () => {
    const out = sincronizzaDirettrici(
      [
        { nome: 'Gestione del credito', prodotti: ['vecchio'] },
        { nome: 'Presidio dei flussi', prodotti: [] },
      ],
      [
        { direttrice: 'Presidio dei flussi', nome: 'DURC' },
        { direttrice: 'Gestione del credito', nome: 'Diffide' },
      ]
    );
    expect(out).toEqual([
      { nome: 'Gestione del credito', prodotti: ['Diffide'] },
      { nome: 'Presidio dei flussi', prodotti: ['DURC'] },
    ]);
  });

  it('una direttrice senza prodotti resta: è da completare, non da cancellare', () => {
    const out = sincronizzaDirettrici([{ nome: 'Ufficio legale', prodotti: [] }], []);
    expect(out).toEqual([{ nome: 'Ufficio legale', prodotti: [] }]);
  });

  it('un prodotto su una direttrice nuova la aggiunge in coda', () => {
    const out = sincronizzaDirettrici(
      [{ nome: 'Gestione del credito', prodotti: [] }],
      [{ direttrice: 'Flussi informativi', nome: 'Uniemens' }]
    );
    expect(out.map((d) => d.nome)).toEqual(['Gestione del credito', 'Flussi informativi']);
    expect(out[1].prodotti).toEqual(['Uniemens']);
  });

  it('la grafia non crea doppioni', () => {
    const out = sincronizzaDirettrici(
      [{ nome: 'Gestione del credito', prodotti: [] }],
      [{ direttrice: ' gestione DEL credito ', nome: 'Diffide' }]
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ nome: 'Gestione del credito', prodotti: ['Diffide'] });
  });
});
