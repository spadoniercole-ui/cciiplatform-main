import { describe, it, expect } from 'vitest';
import { normalizzaLetturaPosizione, promptLetturaPosizione } from './letturaPdf';

describe('posizione aggiornata letta da PDF', () => {
  it('riporta i valori trovati e dichiara quelli mancanti', () => {
    const l = normalizzaLetturaPosizione({
      dataRiferimento: '2026-06-30',
      campi: {
        totaleAttivo: 1296147,
        patrimonioNetto: '-354.000',
        debitiTributari: '612.000',
        disponibilitaLiquide: '88.147,00',
        ricaviVendite: 532000,
        ebitda: null,
      },
      note: ['Conto economico del primo semestre 2026'],
    });
    expect(l.dataRiferimento).toBe('2026-06-30');
    expect(l.dati.totaleAttivo).toBe(1296147);
    expect(l.dati.patrimonioNetto).toBe(-354000);
    expect(l.dati.debitiTributari).toBe(612000);
    expect(l.dati.disponibilitaLiquide).toBe(88147);
    expect(l.trovati).toContain('ricaviVendite');
    expect(l.mancanti).toContain('ebitda');
    expect(l.dati.ebitda).toBe(0);
  });

  it('una risposta vuota non inventa nulla', () => {
    const l = normalizzaLetturaPosizione(null);
    expect(l.trovati).toEqual([]);
    expect(l.dataRiferimento).toBeNull();
  });

  it('il prompt elenca tutti i campi del prospetto', () => {
    expect(promptLetturaPosizione()).toContain('"debitiPrevidenziali"');
  });
});
