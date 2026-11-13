import { describe, it, expect } from 'vitest';
import {
  checklistProdottiCompleta,
  coloreDaQualificazione,
  dettaglioQualificazioneProdotti,
} from './pesoProdotti';
import { sintesiChecklistProdotti, vociChecklistProdotti } from '@/lib/prodotti/prodotti';
import type { ProdottoEnte } from '@/lib/prodotti/prodotti';

// Il peso della check list dei prodotti nell'indicatore. I casi che contano:
// completa con squilibrio → peggiora; incompleta → non pesa; nessun prodotto in
// check list → non pesa, e non diventa «neutro».

function prodotto(id: number, inChecklist: boolean): ProdottoEnte {
  return {
    id,
    direttrice: 'CONCORDATO',
    nome: `Prodotto ${id}`,
    inChecklist,
    ordine: id,
    domande: [
      {
        id: `d${id}`,
        testo: `Domanda ${id}`,
        tipo: 'SI_NO',
        maxCaratteri: null,
        rispostaNegativa: 'NO',
      },
    ],
  } as ProdottoEnte;
}

describe('completamento della check list dei prodotti', () => {
  it('senza prodotti in check list non è completa: non c’è nulla da chiedere', () => {
    const voci = vociChecklistProdotti([prodotto(1, false)]);
    const sintesi = sintesiChecklistProdotti(voci, []);
    expect(sintesi.totale).toBe(0);
    expect(checklistProdottiCompleta(sintesi)).toBe(false);
    expect(checklistProdottiCompleta(null)).toBe(false);
  });

  it('una domanda senza risposta tiene la check list incompleta', () => {
    const voci = vociChecklistProdotti([prodotto(1, true)]);
    expect(checklistProdottiCompleta(sintesiChecklistProdotti(voci, []))).toBe(false);
  });

  it('tutte le risposte date la rendono completa', () => {
    const voci = vociChecklistProdotti([prodotto(1, true)]);
    const sintesi = sintesiChecklistProdotti(voci, [
      { prodottoId: 1, domandaId: 'd1', siNo: false, testo: null },
    ]);
    expect(checklistProdottiCompleta(sintesi)).toBe(true);
  });
});

describe('dalla qualificazione al colore dell’indicatore', () => {
  it('squilibrio → rosso, misto → giallo, sistemica → verde', () => {
    expect(coloreDaQualificazione('SQUILIBRIO')).toBe('rosso');
    expect(coloreDaQualificazione('DA_APPROFONDIRE')).toBe('giallo');
    expect(coloreDaQualificazione('SISTEMICA')).toBe('verde');
  });

  it('non valutabile → null, non «grigio»: una dimensione scoperta, non neutra', () => {
    expect(coloreDaQualificazione('NON_VALUTABILE')).toBeNull();
    expect(coloreDaQualificazione(null)).toBeNull();
  });
});

describe('il dettaglio porta i numeri, non solo l’etichetta', () => {
  it('dice quante positive, quante negative e quante risposte su quante', () => {
    const voci = vociChecklistProdotti([prodotto(1, true), prodotto(2, true)]);
    const sintesi = sintesiChecklistProdotti(voci, [
      { prodottoId: 1, domandaId: 'd1', siNo: false, testo: null },
      { prodottoId: 2, domandaId: 'd2', siNo: true, testo: null },
    ]);
    const dettaglio = dettaglioQualificazioneProdotti(sintesi);
    expect(dettaglio).toContain('Check list dei prodotti');
    expect(dettaglio).toContain('1 risposte lette come positive');
    expect(dettaglio).toContain('1 come negative');
    expect(dettaglio).toContain('2/2 risposte date');
    expect(dettaglio).toContain('non lo migliora');
  });
});
