import { describe, it, expect } from 'vitest';
import {
  baseDaValidare,
  haPercentuali,
  leggiSuggerimento,
  normalizzaBase,
  ranghiCoperti,
} from './suggerimentoScenari';
import { RANGHI } from './scenari';

describe('suggerimento degli scenari', () => {
  it('legge percentuali con la virgola, tutti i ranghi e le fonti', () => {
    const s = leggiSuggerimento({
      base: 'CASISTICA',
      costiProceduraPct: '12,5',
      ranghi: [
        { rango: 'privilegiato', tassoLiquidazionePct: '30,5', cramDownPct: 100 },
        { rango: 'CHIROGRAFARIO', tassoLiquidazionePct: 6.4, cramDownPct: '20' },
      ],
      note: 'Stime da dieci omologazioni.',
      fonti: [{ titolo: 'Osservatorio', url: 'https://example.org/osservatorio' }],
    });

    // Tutti i ranghi previsti, anche quelli non restituiti dalla ricerca.
    expect(s.parametri.ranghi.map((r) => r.rango)).toEqual(RANGHI.map((r) => r.codice));
    expect(s.parametri.costiProceduraPct).toBe(12.5);
    expect(s.parametri.ranghi.find((r) => r.rango === 'PRIVILEGIATO')).toEqual({
      rango: 'PRIVILEGIATO',
      tassoLiquidazionePct: 30.5,
      cramDownPct: 100,
    });
    expect(s.parametri.ranghi.find((r) => r.rango === 'CHIROGRAFARIO')?.cramDownPct).toBe(20);
    expect(s.base).toBe('CASISTICA');
    expect(s.fonti).toHaveLength(1);
    expect(haPercentuali(s)).toBe(true);
    expect(ranghiCoperti(s).sort()).toEqual(['CHIROGRAFARIO', 'PRIVILEGIATO']);
  });

  it('scarta i valori fuori scala e le fonti non http', () => {
    const s = leggiSuggerimento({
      base: 'DATO_UFFICIALE',
      costiProceduraPct: 130,
      ranghi: [{ rango: 'POSTERGATO', tassoLiquidazionePct: -1, cramDownPct: 'non un numero' }],
      fonti: [{ titolo: 'locale', url: 'file:///tmp/x' }],
    });
    expect(s.parametri.costiProceduraPct).toBeNull();
    expect(s.parametri.ranghi.find((r) => r.rango === 'POSTERGATO')).toEqual({
      rango: 'POSTERGATO',
      tassoLiquidazionePct: null,
      cramDownPct: null,
    });
    expect(s.fonti).toEqual([]);
    expect(haPercentuali(s)).toBe(false);
  });

  it('riconosce le basi dichiarate in modi diversi', () => {
    expect(normalizzaBase('dato ufficiale')).toBe('DATO_UFFICIALE');
    expect(normalizzaBase('statistica ministeriale')).toBe('DATO_UFFICIALE');
    expect(normalizzaBase('case history')).toBe('CASISTICA');
    expect(normalizzaBase('best practice')).toBe('PRASSI');
    expect(normalizzaBase('mista')).toBe('MISTA');
    expect(normalizzaBase('')).toBe('NON_DICHIARATA');
    expect(normalizzaBase('altro')).toBe('NON_DICHIARATA');
  });

  it('solo il dato ufficiale non richiede la validazione della casistica', () => {
    expect(baseDaValidare('DATO_UFFICIALE')).toBe(false);
    expect(baseDaValidare('CASISTICA')).toBe(true);
    expect(baseDaValidare('PRASSI')).toBe(true);
    expect(baseDaValidare('MISTA')).toBe(true);
    expect(baseDaValidare('NON_DICHIARATA')).toBe(true);
  });
});
