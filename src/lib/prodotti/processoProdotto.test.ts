import { describe, expect, it } from 'vitest';
import {
  MASSIMO_TS_OPERATIVITA,
  normalizzaProcesso,
  operativitaDelProdotto,
  processiDelProdotto,
  rigaProcesso,
  validaProcesso,
  type ProcessoProdotto,
} from './processoProdotto';

const base = {
  prodottoId: 1,
  tlIds: [2],
  dipendenza: null,
  attivita: 'Passo',
  esito: null,
};

describe('validaProcesso', () => {
  it('pretende il prodotto', () => {
    expect(validaProcesso({ ...base, prodottoId: 0 })).toMatch(/prodotto/);
  });

  it('pretende almeno una TS', () => {
    expect(validaProcesso({ ...base, tlIds: [] })).toMatch(/TS/);
  });

  it('non pone un tetto a una sola TS', () => {
    // Le TS non si escludono: una sola operatività può metterne insieme più
    // d'una, perché verificano cose diverse dello stesso prodotto.
    expect(validaProcesso({ ...base, tlIds: [2, 3, 4] })).toBeNull();
  });

  it('rifiuta un numero di TS oltre il tetto', () => {
    const molte = Array.from({ length: MASSIMO_TS_OPERATIVITA + 1 }, (_, i) => i + 1);
    expect(validaProcesso({ ...base, tlIds: molte })).toMatch(/più di/);
  });

  it('rifiuta una TS che non è un id', () => {
    expect(validaProcesso({ ...base, tlIds: [0] })).toMatch(/non è valida/);
  });

  it('pretende le attività: senza, non è un processo', () => {
    expect(validaProcesso({ ...base, attivita: '   ' })).toMatch(/attività/);
  });

  it('accetta un’operatività completa', () => {
    expect(
      validaProcesso({
        prodottoId: 1,
        tlIds: [2, 5],
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
      tlIds: [2, 2, 3],
      dipendenza: '  Gestione   del credito ',
      attivita: '   ',
      esito: null,
    });
    expect(n.dipendenza).toBe('Gestione del credito');
    expect(n.attivita).toBeNull();
    // La TS ripetuta è la stessa riga due volte: conta una volta.
    expect(n.tlIds).toEqual([2, 3]);
  });
});

describe('lettura e ordine', () => {
  const riga = (p: Partial<ProcessoProdotto>): ProcessoProdotto => ({
    id: 1,
    prodottoId: 1,
    tlId: 1,
    gruppo: null,
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
        gruppo: 'g-1',
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
      gruppo: 'g-1',
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

  it('le righe con lo stesso gruppo sono una sola operatività', () => {
    const processi = [
      riga({ id: 1, tlId: 81, gruppo: 'g-1', codice: '81', ordine: 1 }),
      riga({ id: 2, tlId: 400, gruppo: 'g-1', codice: 'M400', ordine: 1 }),
      riga({ id: 3, tlId: 81, gruppo: 'g-2', codice: '81', ordine: 2 }),
    ];
    const ops = operativitaDelProdotto(processi, 1);
    expect(ops.map((o) => o.chiave)).toEqual(['g-1', 'g-2']);
    expect(ops[0].codici).toEqual(['81', 'M400']);
    // La stessa TS in due operatività diverse: non si escludono.
    expect(ops[1].tlIds).toEqual([81]);
  });

  it('le righe senza gruppo sono una operatività ciascuna', () => {
    const processi = [
      riga({ id: 10, tlId: 81, gruppo: null, ordine: 1 }),
      riga({ id: 11, tlId: 400, gruppo: null, ordine: 2 }),
    ];
    expect(operativitaDelProdotto(processi, 1).map((o) => o.chiave)).toEqual(['r10', 'r11']);
  });
});
