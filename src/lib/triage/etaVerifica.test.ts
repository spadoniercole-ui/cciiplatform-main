import { describe, it, expect } from 'vitest';
import { etaVerifica } from './etaVerifica';

describe('età di una verifica', () => {
  it('conta i giorni e calcola il giorno del ricontrollo', () => {
    const e = etaVerifica('2026-10-28', '2026-10-29');
    expect(e).not.toBeNull();
    expect(e!.giorni).toBe(1);
    // Trenta giorni dalla verifica, non da oggi.
    expect(e!.riverifica).toBe('2026-11-27');
    expect(e!.daRicontrollare).toBe(false);
  });

  it('il termine si supera solo OLTRE i trenta giorni', () => {
    // Il trentesimo giorno è ancora dentro la finestra che il foglio dichiara.
    expect(etaVerifica('2026-09-29', '2026-10-29')!.giorni).toBe(30);
    expect(etaVerifica('2026-09-29', '2026-10-29')!.daRicontrollare).toBe(false);
    expect(etaVerifica('2026-09-28', '2026-10-29')!.giorni).toBe(31);
    expect(etaVerifica('2026-09-28', '2026-10-29')!.daRicontrollare).toBe(true);
  });

  it('attraversa il cambio d’ora senza perdere un giorno', () => {
    // 25 ottobre 2026: in Italia l'ora torna indietro. Il conteggio è in UTC,
    // quindi deve restare esatto.
    expect(etaVerifica('2026-10-24', '2026-10-29')!.giorni).toBe(5);
    expect(etaVerifica('2026-01-31', '2026-03-02')!.giorni).toBe(30);
  });

  it('non inventa un allarme con date illeggibili o nel futuro', () => {
    expect(etaVerifica('non una data', '2026-10-29')).toBeNull();
    expect(etaVerifica('2026-10-28', '')).toBeNull();
    // Data di riferimento nel futuro: giorni negativi, nessun allarme.
    const futura = etaVerifica('2026-12-01', '2026-10-29')!;
    expect(futura.giorni).toBeLessThan(0);
    expect(futura.daRicontrollare).toBe(false);
  });

  it('la finestra è un parametro, non un numero sparso nel codice', () => {
    const e = etaVerifica('2026-10-01', '2026-10-29', 7)!;
    expect(e.riverifica).toBe('2026-10-08');
    expect(e.daRicontrollare).toBe(true);
  });
});
