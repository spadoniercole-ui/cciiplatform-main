import { describe, it, expect } from 'vitest';
import { normalizzaPrimaLettura, promptPrimaLettura } from './primaLettura';

describe('prima lettura dei documenti ricevuti', () => {
  it('tiene i valori validi con passo e documento', () => {
    const p = normalizzaPrimaLettura({
      strumento: { valore: 'ADR_57', passo: 'accordo ex art. 57 CCII', documento: 'Proposta.pdf' },
      dataDeposito: {
        valore: '2026-09-15',
        passo: 'depositato il 15/09/2026',
        documento: 'Proposta.pdf',
      },
      quotaAltriAderenti: {
        valore: '51,2%',
        passo: 'aderenti pari al 51,2%',
        documento: 'Attestazione.pdf',
      },
      percentualeOffertaEnte: { valore: 50, passo: null, documento: null },
      note: ['La data nella proposta e nell’attestazione differisce'],
    });
    expect(p.strumento.valore).toBe('ADR_57');
    expect(p.dataDeposito.valore).toBe('2026-09-15');
    expect(p.quotaAltriAderenti).toEqual({
      valore: 51.2,
      passo: 'aderenti pari al 51,2%',
      documento: 'Attestazione.pdf',
    });
    expect(p.note).toHaveLength(1);
  });

  it('scarta strumenti inventati, date impossibili, percentuali fuori scala', () => {
    const p = normalizzaPrimaLettura({
      strumento: { valore: 'ACCORDO_X', passo: 'x', documento: 'y' },
      dataDeposito: { valore: '2026-02-30' },
      quotaAltriAderenti: { valore: 140 },
    });
    expect(p.strumento).toEqual({ valore: null, passo: null, documento: null });
    expect(p.dataDeposito.valore).toBeNull();
    expect(p.quotaAltriAderenti.valore).toBeNull();
    expect(normalizzaPrimaLettura(null).note).toEqual([]);
  });

  it('il prompt elenca solo gli strumenti ammessi', () => {
    const t = promptPrimaLettura('');
    expect(t).toContain('"ADR_57"');
    expect(t).toContain('"CN_23_2BIS"');
    expect(t).toContain('non dedurre');
  });
});
