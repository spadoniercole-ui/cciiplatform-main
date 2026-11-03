import { describe, expect, it } from 'vitest';
import {
  normalizzaProcesso,
  processiDelProdotto,
  rigaProcesso,
  validaProcesso,
  type ProcessoProdotto,
} from './processoProdotto';

describe('validaProcesso', () => {
  it('pretende il prodotto', () => {
    expect(
      validaProcesso({ prodottoId: 0, tlId: 1, dipendenza: null, attivita: 'Passo', esito: null })
    ).toMatch(/prodotto/);
  });

  it('pretende la TS', () => {
    expect(
      validaProcesso({ prodottoId: 1, tlId: 0, dipendenza: null, attivita: 'Passo', esito: null })
    ).toMatch(/TS/);
  });

  it('pretende le attività: senza, non è un processo', () => {
    expect(
      validaProcesso({ prodottoId: 1, tlId: 2, dipendenza: null, attivita: '   ', esito: null })
    ).toMatch(/attività/);
  });

  it('accetta un processo completo', () => {
    expect(
      validaProcesso({
        prodottoId: 1,
        tlId: 2,
        dipendenza: 'Gestione del credito',
        attivita: '1. Verificare il flusso',
        esito: 'Diffida notificata',
      })
    ).toBeNull();
  });
});

describe('normalizzazione', () => {
  it('compatta gli spazi e azzera i campi vuoti', () => {
    const n = normalizzaProcesso({
      prodottoId: 1,
      tlId: 2,
      dipendenza: '  Gestione   del credito ',
      attivita: '   ',
      esito: null,
    });
    expect(n.dipendenza).toBe('Gestione del credito');
    expect(n.attivita).toBeNull();
  });
});

describe('lettura e ordine', () => {
  const riga = (p: Partial<ProcessoProdotto>): ProcessoProdotto => ({
    id: 1,
    prodottoId: 1,
    tlId: 1,
    codice: '81',
    tipologia: 'Diffida',
    dipendenza: null,
    attivita: null,
    esito: null,
    ordine: 1,
    ...p,
  });

  it('legge la riga del database', () => {
    expect(
      rigaProcesso({
        id: 3,
        prodotto_id: 5,
        tl_id: 7,
        codice: '76',
        descrizione: 'CISOA',
        dipendenza: 'Ufficio legale',
        procedura: 'Passo uno',
        esito: 'Notificata',
        ordine: 2,
      })
    ).toMatchObject({
      prodottoId: 5,
      tlId: 7,
      codice: '76',
      tipologia: 'CISOA',
      attivita: 'Passo uno',
      ordine: 2,
    });
  });

  it('i processi di un prodotto seguono l’ordine di esecuzione', () => {
    const processi = [
      riga({ id: 2, prodottoId: 1, ordine: 2 }),
      riga({ id: 1, prodottoId: 1, ordine: 1 }),
      riga({ id: 3, prodottoId: 9, ordine: 1 }),
    ];
    expect(processiDelProdotto(processi, 1).map((p) => p.id)).toEqual([1, 2]);
  });
});
