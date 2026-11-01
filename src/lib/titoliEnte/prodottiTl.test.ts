import { describe, expect, it } from 'vitest';
import {
  chiaveProdotto,
  normalizzaTlProdotto,
  raggruppaPerProdotto,
  validaTlProdotto,
  type TlProdotto,
} from './prodottiTl';

const voce = (p: Partial<TlProdotto>): TlProdotto => ({
  id: 1,
  direttrice: 'Gestione del credito',
  prodotto: 'DURC',
  tipologia: 'Verifica del flusso',
  dipendenza: 'Gestione del credito',
  procedura: null,
  esito: null,
  ordine: 1,
  rilevantePerimetro: false,
  versoPerimetro: null,
  materie: 0,
  ...p,
});

describe('validaTlProdotto', () => {
  it('pretende la direttrice e il prodotto: sono la chiave della TL', () => {
    expect(
      validaTlProdotto({
        direttrice: ' ',
        prodotto: 'DURC',
        tipologia: 'Diffida',
        dipendenza: null,
        procedura: null,
        esito: null,
      })
    ).toMatch(/direttrice/);
    expect(
      validaTlProdotto({
        direttrice: 'Gestione del credito',
        prodotto: '',
        tipologia: 'Diffida',
        dipendenza: null,
        procedura: null,
        esito: null,
      })
    ).toMatch(/prodotto/);
  });

  it('pretende il verso quando la TL entra nel perimetro', () => {
    expect(
      validaTlProdotto({
        direttrice: 'Gestione del credito',
        prodotto: 'DURC',
        tipologia: 'Diffida',
        dipendenza: null,
        procedura: null,
        esito: null,
        rilevantePerimetro: true,
      })
    ).toMatch(/collaborativa o di resistenza/);
  });

  it('accetta una TL completa', () => {
    expect(
      validaTlProdotto({
        direttrice: 'Gestione del credito',
        prodotto: 'DURC',
        tipologia: 'Diffida',
        dipendenza: 'Gestione del credito',
        procedura: null,
        esito: null,
      })
    ).toBeNull();
  });
});

describe('normalizzaTlProdotto', () => {
  it('compatta gli spazi e toglie il verso quando la TL non è rilevante', () => {
    const n = normalizzaTlProdotto({
      direttrice: '  Gestione   del credito ',
      prodotto: ' DURC ',
      tipologia: '  Diffida  ',
      dipendenza: null,
      procedura: null,
      esito: null,
      rilevantePerimetro: false,
      versoPerimetro: 'RESISTENZA',
    });
    expect(n.direttrice).toBe('Gestione del credito');
    expect(n.prodotto).toBe('DURC');
    expect(n.tipologia).toBe('Diffida');
    expect(n.versoPerimetro).toBeNull();
  });
});

describe('raggruppaPerProdotto', () => {
  it('raggruppa per direttrice e prodotto, con le TL in ordine di esecuzione', () => {
    const gruppi = raggruppaPerProdotto([
      voce({ id: 2, ordine: 2, tipologia: 'Diffida' }),
      voce({ id: 1, ordine: 1, tipologia: 'Verifica del flusso' }),
      voce({ id: 3, direttrice: 'Presidio dei flussi', prodotto: 'Cassa Integrazione' }),
    ]);
    expect(gruppi).toHaveLength(2);
    // Prima la direttrice che viene prima in ordine alfabetico: «Gestione…»
    // prima di «Presidio…».
    expect(gruppi.map((g) => g.prodotto)).toEqual(['DURC', 'Cassa Integrazione']);
    expect(gruppi[0].voci.map((v) => v.tipologia)).toEqual(['Verifica del flusso', 'Diffida']);
  });

  it('la chiave del prodotto non dipende dalla grafia', () => {
    expect(chiaveProdotto('Gestione  del Credito', ' DURC ')).toBe(
      chiaveProdotto('gestione del credito', 'durc')
    );
  });
});
