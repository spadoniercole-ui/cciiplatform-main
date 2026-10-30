import { describe, expect, it } from 'vitest';
import { periodoCompetenza, testoPeriodo } from './periodi';

describe('periodoCompetenza', () => {
  it('legge le due forme testuali dei tracciati', () => {
    expect(periodoCompetenza('09/2024')).toEqual({ anno: 2024, mese: 9 });
    expect(periodoCompetenza('2024/09')).toEqual({ anno: 2024, mese: 9 });
    expect(periodoCompetenza('2024-9')).toEqual({ anno: 2024, mese: 9 });
    expect(periodoCompetenza('9.2024')).toEqual({ anno: 2024, mese: 9 });
  });

  it('legge una cella che è una vera data di Excel', () => {
    // È il caso che faceva sparire il file: con `cellDates` la cella arriva
    // come Date, e una regex sul testo la scartava in silenzio.
    expect(periodoCompetenza(new Date(Date.UTC(2024, 8, 1)))).toEqual({ anno: 2024, mese: 9 });
    // Seriali di Excel, che i fogli usano al posto della data.
    expect(periodoCompetenza(45_540)).toEqual({ anno: 2024, mese: 9 });
  });

  it('legge le date complete senza confonderle con i periodi ridotti', () => {
    expect(periodoCompetenza('01/09/2024')).toEqual({ anno: 2024, mese: 9 });
    expect(periodoCompetenza('2024-09-01')).toEqual({ anno: 2024, mese: 9 });
    expect(periodoCompetenza('2024-09-01T00:00:00.000Z')).toEqual({ anno: 2024, mese: 9 });
  });

  it('legge AAAAMM in entrambi i versi, come numero e come testo', () => {
    expect(periodoCompetenza(202_409)).toEqual({ anno: 2024, mese: 9 });
    expect(periodoCompetenza('202409')).toEqual({ anno: 2024, mese: 9 });
    expect(periodoCompetenza('092024')).toEqual({ anno: 2024, mese: 9 });
  });

  it('legge il mese scritto a parole', () => {
    expect(periodoCompetenza('Settembre 2024')).toEqual({ anno: 2024, mese: 9 });
    expect(periodoCompetenza('competenza: dicembre 2025')).toEqual({ anno: 2025, mese: 12 });
  });

  it('un periodo illeggibile resta null, non un mese inventato', () => {
    for (const v of [null, undefined, '', 'nd', 'non disponibile', 0, 12, '2024', '13/2024']) {
      expect(periodoCompetenza(v)).toBeNull();
    }
  });
});

describe('testoPeriodo', () => {
  it('scrive il mese con due cifre nella forma richiesta', () => {
    expect(testoPeriodo({ anno: 2024, mese: 9 })).toBe('09/2024');
    expect(testoPeriodo({ anno: 2024, mese: 9 }, 'AAAA/MM')).toBe('2024/09');
  });
});
