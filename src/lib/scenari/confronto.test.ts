import { describe, expect, it } from 'vitest';
import { differenza, riepilogaSovrascritture, type Sovrascrittura } from '@/lib/scenari/confronto';

const riga = (anno: number, voce: string, base: number, inserito: number): Sovrascrittura => ({
  anno,
  voce,
  valoreBase: base,
  valoreInserito: inserito,
  differenza: differenza(base, inserito),
});

describe('sovrascritture della base', () => {
  it('calcola la differenza con segno e due decimali', () => {
    expect(differenza(100, 130)).toBe(30);
    expect(differenza(100, 70)).toBe(-30);
    expect(differenza(10.004, 10)).toBe(0);
  });

  it('riepiloga numero, somma assoluta, media e anni', () => {
    const statistiche = riepilogaSovrascritture([
      riga(2024, 'ricaviVendite', 500_000, 450_000),
      riga(2024, 'ebitda', 100_000, 130_000),
      riga(2025, 'ricaviVendite', 550_000, 500_000),
    ]);

    expect(statistiche.numero).toBe(3);
    expect(statistiche.sommaAssoluta).toBe(130_000);
    expect(statistiche.mediaAssoluta).toBe(43_333.33);
    expect(statistiche.perAnno).toEqual([
      { anno: 2024, numero: 2, sommaAssoluta: 80_000 },
      { anno: 2025, numero: 1, sommaAssoluta: 50_000 },
    ]);
  });

  it('senza righe non inventa una media', () => {
    expect(riepilogaSovrascritture([])).toEqual({
      numero: 0,
      sommaAssoluta: 0,
      mediaAssoluta: 0,
      perAnno: [],
    });
  });
});
