import { describe, expect, it } from 'vitest';
import { breakEvenAccordo } from './breakEven';

// «Non calcolabile» da solo costringe a indovinare: qui si verifica che il
// punto di pareggio dica CHE COSA manca, così la pagina può chiederlo.

describe('le cause del non calcolabile', () => {
  it('senza credito dice che manca il credito, e anche la cassa se manca', () => {
    const b = breakEvenAccordo({
      credito: null,
      disponibilita: null,
      flusso: null,
      liquidazioneNetta: 7_782,
      cramDownNetto: 30_400,
    });
    expect(b.recuperoMinimo).toBeNull();
    expect(b.mancanti).toContain('il credito vantato');
    expect(b.mancanti).toContain('la disponibilità liquide');
    expect(b.dettaglio).toContain('credito');
  });

  it('con il credito ma senza cassa dice che manca la disponibilità', () => {
    const b = breakEvenAccordo({
      credito: 152_000,
      disponibilita: null,
      flusso: 44_910,
      liquidazioneNetta: 7_782,
      cramDownNetto: 30_400,
    });
    expect(b.scoperto).toBeNull();
    expect(b.mancanti).toEqual(['la disponibilità liquide']);
    expect(b.recuperoMinimo).toBe(30_400);
  });

  it('senza procedure calcolabili dice che mancano le percentuali del rango', () => {
    const b = breakEvenAccordo({
      credito: 152_000,
      disponibilita: 74_910,
      flusso: 44_910,
      liquidazioneNetta: null,
      cramDownNetto: null,
    });
    expect(b.recuperoMinimo).toBeNull();
    expect(b.mancanti.join(' ')).toContain('percentuali del rango');
  });

  it('quando tutto c’è, non elenca cause inventate', () => {
    const b = breakEvenAccordo({
      credito: 152_000,
      disponibilita: 74_910,
      flusso: 44_910,
      liquidazioneNetta: 7_782,
      cramDownNetto: 30_400,
    });
    expect(b.mancanti).toEqual([]);
    expect(b.scoperto).toBe(77_090);
    expect(b.recuperoMinimo).toBe(30_400);
  });
});
