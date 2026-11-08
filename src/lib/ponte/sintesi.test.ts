// src/lib/ponte/sintesi.test.ts
//
// La Sintesi integrata non inventa il recupero: usa i parametri dell'ente, e
// quando mancano lo dichiara. Questi test fissano le tre cose che non devono
// cambiare per distrazione: il credito certo non diventa zero, le percentuali
// non compaiono dal nulla, il recupero non si sottrae al debito.

import { describe, expect, it } from 'vitest';
import { sintesiIntegrata } from './sintesi';
import type { ParametriScenari } from '@/lib/triage/scenari';

const parametri = (mod: Partial<ParametriScenari> = {}): ParametriScenari => ({
  costiProceduraPct: 10,
  ranghi: [
    { rango: 'PRIVILEGIATO', tassoLiquidazionePct: 60, cramDownPct: 40 },
    { rango: 'CHIROGRAFARIO', tassoLiquidazionePct: 20, cramDownPct: 15 },
    { rango: 'PREDEDUCIBILE', tassoLiquidazionePct: null, cramDownPct: null },
    { rango: 'POSTERGATO', tassoLiquidazionePct: null, cramDownPct: null },
  ],
  ...mod,
});

const base = {
  debitoTotaleStimato: 400_000,
  cassaFinale: 12_000,
  rangoCredito: 'PRIVILEGIATO' as const,
};

describe('sintesi integrata', () => {
  it('mette il credito certo accanto al debito e applica le percentuali dell’ente', () => {
    const s = sintesiIntegrata({ ...base, creditoEnte: 100_000, parametriScenari: parametri() });
    expect(s.creditoEnte).toBe(100_000);
    expect(s.incidenzaCreditoPct).toBe(25);
    // 100.000 × 60% = 60.000; spese 10% = 6.000; netto 54.000.
    expect(s.recupero?.liquidazione.netto).toBe(54_000);
    expect(s.recupero?.cramDown.netto).toBe(40_000);
    expect(s.mancanti).toEqual([]);
    expect(s.avvisi).toEqual([]);
  });

  it('senza credito certo non produce zero né un recupero', () => {
    const s = sintesiIntegrata({ ...base, creditoEnte: null, parametriScenari: parametri() });
    expect(s.creditoEnte).toBeNull();
    expect(s.incidenzaCreditoPct).toBeNull();
    expect(s.recupero?.liquidazione.calcolabile).toBe(false);
    expect(s.recupero?.liquidazione.netto).toBeNull();
    expect(s.mancanti.join(' ')).toContain('credito dell’ente');
  });

  it('senza parametri dell’ente il recupero è null e il motivo è dichiarato', () => {
    const s = sintesiIntegrata({ ...base, creditoEnte: 100_000, parametriScenari: null });
    expect(s.recupero).toBeNull();
    expect(s.mancanti.join(' ')).toContain('Parametri › Scenari');
    expect(s.avvisi).toEqual([]);
  });

  it('senza rango le percentuali non si applicano, anche se configurate', () => {
    const s = sintesiIntegrata({
      ...base,
      rangoCredito: null,
      creditoEnte: 100_000,
      parametriScenari: parametri(),
    });
    expect(s.rangoEtichetta).toBeNull();
    expect(s.recupero?.liquidazione.calcolabile).toBe(false);
    expect(s.mancanti.join(' ')).toContain('rango');
    expect(s.avvisi.join(' ')).toContain('non è calcolabile');
  });

  it('un credito oltre il debito totale è un perimetro da verificare, non una compensazione', () => {
    const s = sintesiIntegrata({
      ...base,
      debitoTotaleStimato: 50_000,
      creditoEnte: 100_000,
      parametriScenari: parametri(),
    });
    expect(s.incidenzaCreditoPct).toBe(200);
    expect(s.avvisi.join(' ')).toContain('supera il debito totale stimato');
  });
});
