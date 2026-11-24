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
  it('calcola l’accordo sulla media proposta, con la percentuale accanto', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      percentualeMediaProposta: 30,
    });
    const accordo = importoAccordo(righe);
    expect(accordo?.percentuale).toBe(30);
    expect(accordo?.importo).toBe(30000);
    expect(accordo?.calcolabile).toBe(true);
    expect(accordo?.fonte).toContain('media proposta');
  });

  it('mette l’accordo in testa e le due procedure dopo', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      percentualeMediaProposta: 30,
    });
    expect(righe.map((r) => r.codice)).toEqual(['ACCORDO', 'LIQUIDAZIONE', 'CRAM_DOWN']);
  });

  it('la liquidazione è al netto delle spese di procedura, il cram down no', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      percentualeMediaProposta: 30,
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

  it('se manca la media proposta non inventa un importo per l’accordo', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      percentualeMediaProposta: null,
    });
    const accordo = importoAccordo(righe);
    expect(accordo?.importo).toBeNull();
    expect(accordo?.calcolabile).toBe(false);
    expect(accordo?.motivo).toMatch(/media proposta/);
  });

  it('senza credito nessuno dei tre importi si calcola, e il motivo lo dice', () => {
    const righe = importiDaPercentuali({
      credito: null,
      rango: 'PRIVILEGIATO',
      parametri,
      percentualeMediaProposta: 30,
    });
    for (const r of righe) {
      expect(r.importo).toBeNull();
      expect(r.calcolabile).toBe(false);
      expect(r.motivo).toBeTruthy();
    }
  });

  it('una percentuale fuori scala non diventa un importo', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: 'PRIVILEGIATO',
      parametri,
      percentualeMediaProposta: 130,
    });
    expect(importoAccordo(righe)?.importo).toBeNull();
    expect(importoAccordo(righe)?.motivo).toMatch(/non è configurata/);
  });

  it('senza rango le due procedure si dichiarano non calcolabili, non zero', () => {
    const righe = importiDaPercentuali({
      credito: 100000,
      rango: null,
      parametri,
      percentualeMediaProposta: 30,
    });
    const liq = righe.find((r) => r.codice === 'LIQUIDAZIONE');
    const cram = righe.find((r) => r.codice === 'CRAM_DOWN');
    expect(liq?.importo).toBeNull();
    expect(liq?.calcolabile).toBe(false);
    expect(cram?.importo).toBeNull();
    expect(cram?.motivo).toMatch(/rango/);
  });
});
