import { describe, expect, it } from 'vitest';
import { pianoVerificaDaColonne, testoPianoVerifica, ultimoAnnoVerifica } from './pianoDaVerifica';

const COLONNE = [
  {
    anno: 2024,
    tipo: 'STORICO',
    dati: { ricaviVendite: 1900000, utileEsercizio: 45000, patrimonioNetto: 370000 },
  },
  {
    anno: 2025,
    tipo: 'STORICO',
    dati: { ricaviVendite: 2000000, utileEsercizio: 30000, patrimonioNetto: 400000 },
  },
  {
    anno: 2026,
    tipo: 'CALCOLATO',
    dati: { ricaviVendite: 2050000, utileEsercizio: 52000, patrimonioNetto: 452000 },
  },
];

describe('il piano dell’azienda dalla verifica aziendale', () => {
  it('legge le annualità salvate, senza ricalcolare nulla', () => {
    const anni = pianoVerificaDaColonne(COLONNE);
    expect(anni.map((a) => a.anno)).toEqual([2024, 2025, 2026]);
    expect(anni[2]).toMatchObject({ tipo: 'CALCOLATO', ricavi: 2050000, utile: 52000 });
    expect(anni[0].totaleDebiti).toBeNull();
  });

  it('scarta le colonne senza anno e regge un valore non letto', () => {
    const anni = pianoVerificaDaColonne([
      { tipo: 'STORICO', dati: {} },
      { anno: 2025, tipo: 'STORICO', dati: { ricaviVendite: null } },
    ]);
    expect(anni).toHaveLength(1);
    expect(anni[0].ricavi).toBeNull();
  });

  it('scrive il blocco del prompt, distinguendo depositato e costruito', () => {
    const testo = testoPianoVerifica(pianoVerificaDaColonne(COLONNE));
    expect(testo).toContain('2026 (costruito dalla verifica): ricavi 2050000 €');
    expect(testo).toContain('2024 (depositato)');
    expect(testoParametriVuoto()).toBe(true);
  });

  it('l’ultimo anno è quello da cui il piano simulato riparte', () => {
    expect(ultimoAnnoVerifica(pianoVerificaDaColonne(COLONNE))).toBe(2026);
    expect(ultimoAnnoVerifica([])).toBeNull();
  });
});

function testoParametriVuoto(): boolean {
  return testoPianoVerifica([]) === '';
}
