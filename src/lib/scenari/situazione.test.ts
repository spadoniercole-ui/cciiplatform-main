import { describe, expect, it } from 'vitest';
import { MESSAGGIO_SCENARIO_BLOCCATO, originePerSituazione, passiDaRivedere } from './situazione';

describe('originePerSituazione', () => {
  it('per un ente la proposta arriva dall’azienda', () => {
    expect(originePerSituazione(true, 'PROPOSTA')).toBe('Azienda');
  });

  it('per un ente decreto e cram down arrivano dal tribunale', () => {
    expect(originePerSituazione(true, 'DECRETO_LIQUIDAZIONE')).toBe('Tribunale');
    expect(originePerSituazione(true, 'CRAM_DOWN')).toBe('Tribunale');
  });

  it('per un redigente l’origine non si tocca', () => {
    expect(originePerSituazione(false, 'PROPOSTA')).toBeUndefined();
  });
});

describe('passiDaRivedere', () => {
  it('elenca proposta e check list con i numeri veri', () => {
    expect(passiDaRivedere({ propostaRighe: 3, risposteChecklist: 12 })).toEqual([
      'Proposta: 3 righe di creditori da ricontrollare',
      'Check List: 12 risposte da riconfermare',
    ]);
  });

  it('usa il singolare quando la riga è una', () => {
    expect(passiDaRivedere({ propostaRighe: 1, risposteChecklist: 1 })).toEqual([
      'Proposta: 1 riga di creditori da ricontrollare',
      'Check List: 1 risposta da riconfermare',
    ]);
  });

  it('senza passi compilati non inventa nulla da rivedere', () => {
    expect(passiDaRivedere({ propostaRighe: 0, risposteChecklist: 0 })).toEqual([]);
  });

  it('il messaggio di blocco è uno solo', () => {
    expect(MESSAGGIO_SCENARIO_BLOCCATO).toMatch(/sola lettura permanente/);
  });
});
