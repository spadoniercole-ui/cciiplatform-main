import { describe, expect, it } from 'vitest';
import { componiLetturaQualitativa } from './letturaQualitativa';
import { sintesiChecklistProdotti, vociChecklistProdotti } from '@/lib/prodotti/prodotti';
import type { ProdottoEnte } from '@/lib/prodotti/prodotti';

// Una sola lettura del quadro qualitativo: la regola «pesa solo se completa»
// non vive più in due punti, quindi non può divergere fra indicatore e
// Posizione.

function prodotto(id: number, tipoChiuso = true): ProdottoEnte {
  return {
    id,
    direttrice: 'CONCORDATO',
    nome: `Prodotto ${id}`,
    inChecklist: true,
    ordine: id,
    domande: tipoChiuso
      ? [
          {
            id: `d${id}`,
            testo: `Domanda ${id}`,
            tipo: 'SI_NO',
            maxCaratteri: null,
            rispostaNegativa: 'NO',
          },
        ]
      : [
          {
            id: `d${id}`,
            testo: `Racconta ${id}`,
            tipo: 'TESTO_LIBERO',
            maxCaratteri: 300,
            rispostaNegativa: null,
          },
        ],
  } as ProdottoEnte;
}

describe('lettura del quadro qualitativo', () => {
  it('check list completa con risposte positive: verde, con il dettaglio', () => {
    const sintesi = sintesiChecklistProdotti(vociChecklistProdotti([prodotto(1)]), [
      { prodottoId: 1, domandaId: 'd1', siNo: true, testo: null },
    ]);
    const l = componiLetturaQualitativa(sintesi, null);
    expect(l.colore).toBe('verde');
    expect(l.completa).toBe(true);
    expect(l.motivo).toBeNull();
    expect(l.dettaglio).toContain('orientamento sommario');
    expect(l.sintesi).toBe(sintesi);
  });

  it('check list incompleta: il quadro resta fuori, col motivo e i numeri', () => {
    const sintesi = sintesiChecklistProdotti(vociChecklistProdotti([prodotto(1), prodotto(2)]), [
      { prodottoId: 1, domandaId: 'd1', siNo: false, testo: null },
    ]);
    const l = componiLetturaQualitativa(sintesi, 12);
    expect(l.colore).toBeNull();
    expect(l.dettaglio).toBeNull();
    expect(l.completa).toBe(false);
    expect(l.motivo).toContain('1/2 risposte');
    // La pesata letta resta disponibile anche quando il quadro non pesa.
    expect(l.percentualePesata).toBe(12);
  });

  it('senza prodotti in check list non c’è nulla da chiedere, e lo dice', () => {
    const l = componiLetturaQualitativa(null, null);
    expect(l.motivo).toContain('non è leggibile');

    const vuota = sintesiChecklistProdotti([], []);
    const l2 = componiLetturaQualitativa(vuota, null);
    expect(l2.motivo).toContain('Nessun prodotto');
  });

  it('la valutazione pesata al 50% porta il quadro a rosso anche con prodotti positivi', () => {
    const sintesi = sintesiChecklistProdotti(vociChecklistProdotti([prodotto(1)]), [
      { prodottoId: 1, domandaId: 'd1', siNo: true, testo: null },
    ]);
    const l = componiLetturaQualitativa(sintesi, 50);
    expect(l.colore).toBe('rosso');
    expect(l.motivo).toBeNull();
  });

  it('completa ma senza domande chiuse: non valutabile, non verde', () => {
    const sintesi = sintesiChecklistProdotti(vociChecklistProdotti([prodotto(1, false)]), [
      { prodottoId: 1, domandaId: 'd1', siNo: null, testo: 'Nessuna misura' },
    ]);
    const l = componiLetturaQualitativa(sintesi, null);
    expect(l.completa).toBe(true);
    expect(l.colore).toBeNull();
    expect(l.motivo).toContain('non è valutabile');
  });
});
