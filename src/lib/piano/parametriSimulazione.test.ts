import { describe, expect, it } from 'vitest';
import {
  LIMITI_PARAMETRI_SIMULAZIONE,
  PARAMETRI_SIMULAZIONE_PREDEFINITI,
  parametriSimulazioneValidi,
  validaParametriSimulazione,
} from './parametriSimulazione';

describe('parametri della simulazione del piano', () => {
  it('senza nulla di salvato valgono i valori che il codice usava già', () => {
    expect(parametriSimulazioneValidi(null)).toEqual(PARAMETRI_SIMULAZIONE_PREDEFINITI);
    expect(parametriSimulazioneValidi({})).toEqual(PARAMETRI_SIMULAZIONE_PREDEFINITI);
    expect(PARAMETRI_SIMULAZIONE_PREDEFINITI.aliquotaImposteDefault).toBe(27.9);
    expect(PARAMETRI_SIMULAZIONE_PREDEFINITI.variazioneMassimaPct).toBe(50);
    expect(PARAMETRI_SIMULAZIONE_PREDEFINITI.limiteTassoCrescita).toBe(20);
    expect(PARAMETRI_SIMULAZIONE_PREDEFINITI.orizzonteDefault).toBe(5);
  });

  it('un campo impostato vale, gli altri restano al predefinito', () => {
    const p = parametriSimulazioneValidi({ aliquotaImposteDefault: '24', orizzonteDefault: 7 });
    expect(p.aliquotaImposteDefault).toBe(24);
    expect(p.orizzonteDefault).toBe(7);
    expect(p.variazioneMassimaPct).toBe(PARAMETRI_SIMULAZIONE_PREDEFINITI.variazioneMassimaPct);
  });

  it('un valore fuori intervallo o illeggibile non blocca la lettura: ricade sul predefinito', () => {
    const p = parametriSimulazioneValidi({
      aliquotaImposteDefault: 90,
      variazioneMassimaPct: 'molto',
      limiteTassoCrescita: null,
    });
    expect(p).toEqual(PARAMETRI_SIMULAZIONE_PREDEFINITI);
  });

  it('l’orizzonte si arrotonda all’anno intero', () => {
    expect(parametriSimulazioneValidi({ orizzonteDefault: 6.4 }).orizzonteDefault).toBe(6);
  });

  it('la validazione del salvataggio dice quale campo non va e perché', () => {
    expect(validaParametriSimulazione(PARAMETRI_SIMULAZIONE_PREDEFINITI)).toEqual([]);
    const errori = validaParametriSimulazione({
      ...PARAMETRI_SIMULAZIONE_PREDEFINITI,
      aliquotaImposteDefault: 80,
      orizzonteDefault: 12,
    });
    expect(errori).toHaveLength(2);
    expect(errori[0]).toContain('Aliquota d’imposta predefinita');
    expect(errori[0]).toContain('0 e 60');
    expect(errori[1]).toContain('Orizzonte proposto del piano');
    expect(LIMITI_PARAMETRI_SIMULAZIONE.orizzonteDefault.max).toBe(10);
  });
});
