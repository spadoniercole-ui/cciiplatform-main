import { describe, expect, it } from 'vitest';
import { rapportoEnte } from './rapportoEnte';
import type { ParametriScenari } from './scenari';

const parametri = (over: Partial<ParametriScenari> = {}): ParametriScenari => ({
  costiProceduraPct: 20,
  ranghi: [
    { rango: 'PRIVILEGIATO', tassoLiquidazionePct: 80, cramDownPct: 60 },
    { rango: 'CHIROGRAFARIO', tassoLiquidazionePct: 20, cramDownPct: 10 },
    { rango: 'PREDEDUCIBILE', tassoLiquidazionePct: null, cramDownPct: null },
    { rango: 'POSTERGATO', tassoLiquidazionePct: null, cramDownPct: null },
  ],
  ...over,
});

describe('rapporto ente: due righe, X e Y', () => {
  it('calcola liquidazione al netto delle spese, cram down e scostamento dall’atteso', () => {
    const r = rapportoEnte({
      righe: [{ categoria: 'Contributi', dovuto: 100_000, rango: 'PRIVILEGIATO' }],
      parametri: parametri(),
      percentualeAttesaPct: 100,
    });
    expect(r.calcolabile).toBe(true);
    // 100.000 × 80% = 80.000, meno le spese del 20% → 64.000
    expect(r.righe[0].liquidazione).toBe(64_000);
    // 100.000 × 60% = 60.000
    expect(r.righe[0].cramDown).toBe(60_000);
    expect(r.righe[0].atteso).toBe(100_000);
    expect(r.righe[0].scostamentoLiquidazione).toBe(-36_000);
    expect(r.righe[0].scostamentoCramDown).toBe(-40_000);
  });

  it('somma le categorie e riporta i totali', () => {
    const r = rapportoEnte({
      righe: [
        { categoria: 'Contributi', dovuto: 100_000, rango: 'PRIVILEGIATO' },
        { categoria: 'Sanzioni', dovuto: 10_000, rango: 'PRIVILEGIATO' },
      ],
      parametri: parametri(),
      percentualeAttesaPct: 100,
    });
    expect(r.totaleDovuto).toBe(110_000);
    expect(r.totaleLiquidazione).toBe(70_400);
    expect(r.totaleCramDown).toBe(66_000);
    expect(r.totaleAtteso).toBe(110_000);
    expect(r.scostamentoLiquidazione).toBe(-39_600);
  });

  it('un’attesa diversa dal 100% cambia lo scostamento, non il recupero', () => {
    const r = rapportoEnte({
      righe: [{ categoria: 'Contributi', dovuto: 100_000, rango: 'PRIVILEGIATO' }],
      parametri: parametri(),
      percentualeAttesaPct: 90,
    });
    expect(r.righe[0].atteso).toBe(90_000);
    expect(r.righe[0].scostamentoLiquidazione).toBe(-26_000);
  });

  it('senza percentuale attesa la tabella dice che manca, invece di assumere il 100%', () => {
    const r = rapportoEnte({
      righe: [{ categoria: 'Contributi', dovuto: 100_000, rango: 'PRIVILEGIATO' }],
      parametri: parametri(),
      percentualeAttesaPct: null,
    });
    expect(r.calcolabile).toBe(false);
    expect(r.mancanti.join(' ')).toContain('percentuale attesa');
    expect(r.totaleAtteso).toBeNull();
  });

  it('senza tasso di realizzo per il rango la riga è non calcolabile, con il motivo', () => {
    const r = rapportoEnte({
      righe: [{ categoria: 'Contributi', dovuto: 1_000, rango: 'PREDEDUCIBILE' }],
      parametri: parametri(),
      percentualeAttesaPct: 100,
    });
    expect(r.righe[0].liquidazione).toBeNull();
    expect(r.righe[0].motivo).toContain('tasso di realizzo');
    expect(r.calcolabile).toBe(false);
    expect(r.totaleLiquidazione).toBeNull();
  });

  it('senza rango la riga dice che manca, invece di assumerne uno', () => {
    const r = rapportoEnte({
      righe: [{ categoria: 'Contributi', dovuto: 1_000, rango: null }],
      parametri: parametri(),
      percentualeAttesaPct: 100,
    });
    expect(r.righe[0].rango).toBeNull();
    expect(r.righe[0].motivo).toContain('rango');
    expect(r.calcolabile).toBe(false);
  });

  it('senza categorie di debito non si inventa una tabella vuota', () => {
    const r = rapportoEnte({ righe: [], parametri: parametri(), percentualeAttesaPct: 100 });
    expect(r.righe).toEqual([]);
    expect(r.calcolabile).toBe(false);
    expect(r.mancanti.join(' ')).toContain('categorie di debito');
  });
});
