import { describe, it, expect } from 'vitest';
import { importiDaPercentuali, importoAccordo } from './importiPercentuali';
import type { ParametriScenari } from '@/lib/triage/scenari';

const parametri: ParametriScenari = {
  costiProceduraPct: 20,
  ranghi: [
    { rango: 'PREDEDUCIBILE', tassoLiquidazionePct: 100, cramDownPct: 100 },
    { rango: 'PRIVILEGIATO', tassoLiquidazionePct: 30.5, cramDownPct: 50 },
    { rango: 'CHIROGRAFARIO', tassoLiquidazionePct: 6.4, cramDownPct: 20 },
    { rango: 'POSTERGATO', tassoLiquidazionePct: null, cramDownPct: null },
  ],
};

describe('importiDaPercentuali', () => {
  it('l’accordo vale alla soglia di riscontro della proposta, non alla media proposta', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      sogliaRiscontro: 100,
    });
    const accordo = importoAccordo(righe);
    expect(accordo?.etichetta).toBe('Accordo alla soglia di riscontro');
    expect(accordo?.percentuale).toBe(100);
    expect(accordo?.importo).toBe(100000);
    expect(accordo?.calcolabile).toBe(true);
    expect(accordo?.fonte).toContain('soglia di riscontro');
    expect(accordo?.intervallo).toBeNull();
  });

  it('mette l’accordo in testa e le due procedure dopo', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      sogliaRiscontro: 80,
    });
    expect(righe.map((r) => r.codice)).toEqual(['ACCORDO', 'LIQUIDAZIONE', 'CRAM_DOWN']);
  });

  it('la liquidazione è al netto delle spese di procedura, il cram down no', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      sogliaRiscontro: 80,
    });
    const liq = righe.find((r) => r.codice === 'LIQUIDAZIONE');
    const cram = righe.find((r) => r.codice === 'CRAM_DOWN');
    // 100.000 × 30,5% = 30.500 lordi, meno il 20% di spese = 24.400.
    expect(liq?.percentuale).toBe(30.5);
    expect(liq?.importo).toBe(24400);
    // 100.000 × 50% = 50.000, senza costi.
    expect(cram?.percentuale).toBe(50);
    expect(cram?.importo).toBe(50000);
  });

  it('se manca la soglia non inventa un importo per l’accordo', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      sogliaRiscontro: null,
    });
    const accordo = importoAccordo(righe);
    expect(accordo?.importo).toBeNull();
    expect(accordo?.calcolabile).toBe(false);
    expect(accordo?.motivo).toMatch(/soglia di riscontro/);
  });

  it('senza credito nessuno dei tre importi si calcola, e il motivo lo dice', () => {
    const righe = importiDaPercentuali({
      credito: null,
      rango: 'PRIVILEGIATO',
      parametri,
      sogliaRiscontro: 80,
    });
    for (const r of righe) {
      expect(r.importo).toBeNull();
      expect(r.calcolabile).toBe(false);
      expect(r.motivo).toBeTruthy();
      expect(r.intervallo).toBeNull();
    }
  });

  it('una percentuale fuori scala non diventa un importo', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      sogliaRiscontro: 130,
    });
    expect(importoAccordo(righe)?.importo).toBeNull();
    expect(importoAccordo(righe)?.motivo).toMatch(/non è configurata/);
  });

  it('senza rango le procedure si leggono come intervallo, non come «non calcolabile»', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: null,
      parametri,
      sogliaRiscontro: 80,
    });
    const liq = righe.find((r) => r.codice === 'LIQUIDAZIONE');
    const cram = righe.find((r) => r.codice === 'CRAM_DOWN');
    // Liquidazione: dal 6,4% (5.120 € netti) al 100% (80.000 € netti).
    expect(liq?.importo).toBeNull();
    expect(liq?.intervallo).toEqual({
      percentualeDa: 6.4,
      percentualeA: 100,
      importoDa: 5120,
      importoA: 80000,
    });
    expect(liq?.motivo).toMatch(/Scenari del triage/);
    // Cram down: dal 20% (20.000 €) al 100% (100.000 €).
    expect(cram?.intervallo).toEqual({
      percentualeDa: 20,
      percentualeA: 100,
      importoDa: 20000,
      importoA: 100000,
    });
  });

  it('senza le spese di procedura la liquidazione non ha un intervallo inventato', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: null,
      parametri: { ...parametri, costiProceduraPct: null },
      sogliaRiscontro: 80,
    });
    const liq = righe.find((r) => r.codice === 'LIQUIDAZIONE');
    expect(liq?.intervallo).toBeNull();
    expect(liq?.importo).toBeNull();
    expect(liq?.motivo).toMatch(/spese di procedura/);
  });
});
