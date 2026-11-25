import { describe, expect, it } from 'vitest';
import { stimaSenzaProvvedimento } from './stimaSenzaProvvedimento';
import type { ParametriScenari } from '@/lib/triage/scenari';

const parametri: ParametriScenari = {
  costiProceduraPct: 10,
  ranghi: [
    { rango: 'PREDEDUCIBILE', tassoLiquidazionePct: 100, cramDownPct: 100 },
    { rango: 'PRIVILEGIATO', tassoLiquidazionePct: 50, cramDownPct: 60 },
    { rango: 'CHIROGRAFARIO', tassoLiquidazionePct: 10, cramDownPct: 20 },
    { rango: 'POSTERGATO', tassoLiquidazionePct: 0, cramDownPct: 0 },
  ],
};

const riga = (
  voce: string,
  importo: number,
  contributi: number | null,
  sanzioni: number | null
) => ({
  voce,
  importo,
  stato: '',
  contributi,
  sanzioni,
});

describe('stimaSenzaProvvedimento', () => {
  it('in liquidazione sottrae i costi e misura la perdita sul credito vantato', () => {
    const s = stimaSenzaProvvedimento(
      [
        riga('Contributi previdenziali', 100_000, 100_000, null),
        riga('Sanzioni civili', 20_000, null, 20_000),
      ],
      parametri,
      'DECRETO_LIQUIDAZIONE'
    );
    // 100.000 × 50% + 10.000 × 50% + 10.000 × 10%, meno il 10% di spese.
    expect(s.credito).toBe(120_000);
    expect(s.recupero).toBe(50_400);
    expect(s.perdita).toBe(69_600);
    expect(s.perditaPct).toBe(58);
    expect(s.escluso).toBe(0);
  });

  it('nel cram down applica la percentuale del rango senza togliere le spese', () => {
    const s = stimaSenzaProvvedimento(
      [
        riga('Contributi previdenziali', 100_000, 100_000, null),
        riga('Sanzioni civili', 20_000, null, 20_000),
      ],
      parametri,
      'CRAM_DOWN'
    );
    expect(s.recupero).toBe(68_000);
    expect(s.perdita).toBe(52_000);
  });

  it('senza riparto non stima nulla e dichiara l’escluso', () => {
    const s = stimaSenzaProvvedimento(
      [riga('Cartella di pagamento — residuo', 5_000, null, null)],
      parametri,
      'CRAM_DOWN'
    );
    expect(s.credito).toBe(0);
    expect(s.escluso).toBe(5_000);
    expect(s.recupero).toBeNull();
    expect(s.perdita).toBeNull();
    expect(s.perditaPct).toBeNull();
  });

  it('se una percentuale manca il recupero resta non calcolabile, non zero', () => {
    const s = stimaSenzaProvvedimento(
      [riga('Contributi previdenziali', 10_000, 10_000, null)],
      { ...parametri, ranghi: parametri.ranghi.map((r) => ({ ...r, cramDownPct: null })) },
      'CRAM_DOWN'
    );
    expect(s.recupero).toBeNull();
    expect(s.perdita).toBeNull();
    expect(s.mancanti.length).toBeGreaterThan(0);
  });
});
