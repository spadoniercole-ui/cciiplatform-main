import { describe, expect, it } from 'vitest';
import { NON_EQUIPARABILI, PERCORSI, percorsiOrdinati } from './percorsi';

describe('percorsi della verifica amministrativa', () => {
  it('sono tre e restano distinti', () => {
    expect(PERCORSI.map((p) => p.codice)).toEqual([
      'ACCORDO_TRANSATTIVO',
      'LIQUIDAZIONE_GIUDIZIALE',
      'CRAM_DOWN',
    ]);
  });

  it('solo l’accordo porta gli esiti della proposta', () => {
    const accordo = PERCORSI.find((p) => p.codice === 'ACCORDO_TRANSATTIVO')!;
    expect(accordo.esiti?.map((e) => e.codice)).toEqual([
      'DEFINIZIONE_ACCORDO',
      'APERTURA_LIQUIDAZIONE',
      'CRAM_DOWN',
    ]);
    expect(PERCORSI.find((p) => p.codice === 'CRAM_DOWN')!.esiti).toBeUndefined();
    expect(PERCORSI.find((p) => p.codice === 'LIQUIDAZIONE_GIUDIZIALE')!.esiti).toBeUndefined();
  });

  it('chi decide è diverso per ciascun percorso, e il cram down lo dice', () => {
    const per = (c: string) => PERCORSI.find((p) => p.codice === c)!;
    expect(per('ACCORDO_TRANSATTIVO').chiDecide).toContain('voto');
    expect(per('LIQUIDAZIONE_GIUDIZIALE').chiDecide).toContain('tribunale');
    expect(per('CRAM_DOWN').chiDecide).toContain('provvedimento');
    expect(per('CRAM_DOWN').limiti.join(' ')).toMatch(/non è un accordo/i);
  });

  it('il percorso consigliato va per primo, gli altri restano tutti', () => {
    const ordinati = percorsiOrdinati('CRAM_DOWN');
    expect(ordinati[0].codice).toBe('CRAM_DOWN');
    expect(ordinati).toHaveLength(3);
    expect(percorsiOrdinati(null).map((p) => p.codice)).toEqual(PERCORSI.map((p) => p.codice));
  });

  it('la nota di non equiparabilità nomina entrambi i piani e il voto', () => {
    expect(NON_EQUIPARABILI).toContain('accordo');
    expect(NON_EQUIPARABILI).toContain('cram down');
    expect(NON_EQUIPARABILI).toContain('voto');
  });
});
