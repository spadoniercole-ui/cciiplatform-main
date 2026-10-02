import { describe, it, expect } from 'vitest';
import { calcolaRiscontri, type BilancioRiscontri } from './riscontri';

const b: BilancioRiscontri = {
  anno: 2025,
  totaleAttivo: 250_000,
  ricaviVendite: 150_000,
  valoreProduzione: 150_000,
  totaleDebiti: 400_000,
  debitiTributari: 0,
  debitiPrevidenziali: 0,
  ebitda: 0,
  patrimonioNetto: 10_000,
  utileEsercizio: 0,
  indiciViolati: [],
  severity: 'GREEN',
};

describe('impresa minore sui tre esercizi', () => {
  it('con tre bilanci usa il valore più alto e non chiede altri esercizi', () => {
    const r = calcolaRiscontri({
      bilancio: b,
      dimensioniPerAnno: [
        { anno: 2023, totaleAttivo: 320_000, ricavi: 100_000 },
        { anno: 2024, totaleAttivo: 200_000, ricavi: 120_000 },
        { anno: 2025, totaleAttivo: 250_000, ricavi: 150_000 },
      ],
    });
    const attivo = r.soglie.find((s) => s.parametro.startsWith('Attivo'))!;
    expect(attivo.valoreRilevato).toBe(320_000);
    expect(attivo.fonte).toContain('2023, 2024, 2025');
    expect(r.impresaMinore).toBe(false);
    expect(r.datiMancanti.some((d) => d.includes('TRE esercizi'))).toBe(false);
  });

  it('con un solo bilancio lo dichiara', () => {
    const r = calcolaRiscontri({ bilancio: b });
    expect(r.impresaMinore).toBe(true);
    expect(r.datiMancanti.some((d) => d.includes('un solo bilancio'))).toBe(true);
  });
});
