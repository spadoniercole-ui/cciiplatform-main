import { describe, it, expect } from 'vitest';
import {
  conLavorazione,
  descriviProdotto,
  etichettaLavorazione,
  haLavorazioniNeiProdotti,
  lavorazioniDelProdotto,
  normalizzaDirettrice,
  normalizzaProdotto,
  senzaLavorazione,
  serializzaDirettrice,
  serializzaProdotto,
} from './direttriciEnte';

const lavorazioni = [
  { id: 81, tipologia: 'Emissione diffida', dipendenza: 'Gestione del credito' },
  { id: 74, tipologia: 'Sgravio', dipendenza: 'Ufficio Contributi' },
];

describe('normalizzazione dei prodotti', () => {
  it('la configurazione a stringa resta valida: prodotto senza TL', () => {
    expect(normalizzaProdotto('  DURC ')).toEqual({ nome: 'DURC', lavorazioneIds: [] });
    expect(serializzaProdotto('DURC')).toBe('DURC');
  });

  it('gli id delle TL si tengono solo se sono interi positivi, senza doppioni', () => {
    expect(
      normalizzaProdotto({ nome: ' Diffida ', lavorazioneIds: [81, 81, 0, -3, 2.5, 74] })
    ).toEqual({ nome: 'Diffida', lavorazioneIds: [81, 74] });
  });

  it('un prodotto senza TL non porta con sé un oggetto vuoto', () => {
    expect(serializzaProdotto({ nome: 'DURC', lavorazioneIds: [] })).toBe('DURC');
    expect(serializzaProdotto({ nome: 'Diffida', lavorazioneIds: [81] })).toEqual({
      nome: 'Diffida',
      lavorazioneIds: [81],
    });
  });

  it('la direttrice si pulisce e scarta i prodotti vuoti', () => {
    expect(
      normalizzaDirettrice({
        nome: ' Fiscale ',
        prodotti: ['IVA', '   ', { nome: '', lavorazioneIds: [81] }, { nome: 'DURC' }],
      })
    ).toEqual({
      nome: 'Fiscale',
      prodotti: [
        { nome: 'IVA', lavorazioneIds: [] },
        { nome: 'DURC', lavorazioneIds: [] },
      ],
    });
  });

  it('il salvataggio riscrive ogni prodotto nella forma più semplice', () => {
    expect(
      serializzaDirettrice({
        nome: 'Contributiva',
        prodotti: ['INPS', { nome: 'Ticket licenziamento', lavorazioneIds: [81] }],
      })
    ).toEqual({
      nome: 'Contributiva',
      prodotti: ['INPS', { nome: 'Ticket licenziamento', lavorazioneIds: [81] }],
    });
  });
});

describe('legame prodotto → TL', () => {
  it('aggiunge e toglie una TL senza duplicarla', () => {
    const una = conLavorazione('Diffida', 81);
    expect(una).toEqual({ nome: 'Diffida', lavorazioneIds: [81] });
    expect(conLavorazione(una, 81)).toEqual({ nome: 'Diffida', lavorazioneIds: [81] });
    const due = conLavorazione(una, 74);
    expect(due.lavorazioneIds).toEqual([81, 74]);
    expect(senzaLavorazione(due, 81)).toEqual({ nome: 'Diffida', lavorazioneIds: [74] });
  });

  it('un id non valido non entra nel legame', () => {
    expect(conLavorazione('Diffida', 0)).toEqual({ nome: 'Diffida', lavorazioneIds: [] });
  });

  it('le TL del prodotto seguono la configurazione e ignorano gli id orfani', () => {
    const prodotto = { nome: 'Diffida', lavorazioneIds: [999, 81] };
    expect(lavorazioniDelProdotto(prodotto, lavorazioni).map((l) => l.id)).toEqual([81]);
  });

  it('l’etichetta del selettore porta l’ufficio accanto al nome', () => {
    expect(etichettaLavorazione(lavorazioni[0])).toBe('Emissione diffida — Gestione del credito');
    expect(etichettaLavorazione({ id: 5, tipologia: 'Verifica', dipendenza: null })).toBe(
      'Verifica — senza ufficio'
    );
  });
});

describe('la riga del prodotto nel prompt', () => {
  it('senza TL resta il nome, come prima del legame', () => {
    expect(descriviProdotto('DURC', lavorazioni)).toBe('- DURC');
  });

  it('con la TL la nomina, così la domanda riguarda quella lavorazione', () => {
    const riga = descriviProdotto(
      { nome: 'Ticket licenziamento', lavorazioneIds: [81] },
      lavorazioni
    );
    expect(riga).toContain('Ticket licenziamento');
    expect(riga).toContain('«Emissione diffida»');
    expect(riga).toContain('Gestione del credito');
    expect(riga).not.toContain('Sgravio');
  });

  it('più TL sullo stesso prodotto si nominano tutte', () => {
    const riga = descriviProdotto({ nome: 'Diffida', lavorazioneIds: [81, 74] }, lavorazioni);
    expect(riga).toContain('«Emissione diffida»');
    expect(riga).toContain('«Sgravio»');
  });

  it('una TL eliminata non inventa una didascalia', () => {
    expect(descriviProdotto({ nome: 'Diffida', lavorazioneIds: [999] }, lavorazioni)).toBe(
      '- Diffida'
    );
  });

  it('sa dire se una direttrice ha almeno una TL collegata', () => {
    expect(haLavorazioniNeiProdotti([{ nome: 'A', prodotti: ['DURC'] }])).toBe(false);
    expect(
      haLavorazioniNeiProdotti([
        { nome: 'A', prodotti: [{ nome: 'Diffida', lavorazioneIds: [81] }] },
      ])
    ).toBe(true);
  });
});
