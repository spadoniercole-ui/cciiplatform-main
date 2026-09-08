import { describe, it, expect } from 'vitest';
import { formaAERdaAnagrafica } from './formaAER';

// Sbagliare qui significa confrontare i crediti affidati con 100.000 €
// invece che con 500.000 €: un'impresa dichiarata oltre soglia quando non
// lo è. Da qui la scelta di riconoscere poco e bene.

describe('forma giuridica → fattispecie AER', () => {
  it('riconosce le imprese individuali (soglia 100.000 €)', () => {
    expect(formaAERdaAnagrafica('Ditta individuale')).toBe('IMPRESA_INDIVIDUALE');
    expect(formaAERdaAnagrafica('Impresa individuale')).toBe('IMPRESA_INDIVIDUALE');
    expect(formaAERdaAnagrafica('Impresa artigiana')).toBe('IMPRESA_INDIVIDUALE');
  });

  it('riconosce le società di persone (soglia 200.000 €)', () => {
    expect(formaAERdaAnagrafica('S.n.c.')).toBe('SOCIETA_PERSONE');
    expect(formaAERdaAnagrafica('SAS')).toBe('SOCIETA_PERSONE');
    expect(formaAERdaAnagrafica('Società di persone')).toBe('SOCIETA_PERSONE');
  });

  it('riconosce le altre società (soglia 500.000 €)', () => {
    expect(formaAERdaAnagrafica('S.r.l.')).toBe('ALTRE_SOCIETA');
    expect(formaAERdaAnagrafica('SRLS')).toBe('ALTRE_SOCIETA');
    expect(formaAERdaAnagrafica('S.p.A.')).toBe('ALTRE_SOCIETA');
    expect(formaAERdaAnagrafica('Società cooperativa')).toBe('ALTRE_SOCIETA');
  });

  it('non tira a indovinare su forme ambigue o assenti', () => {
    expect(formaAERdaAnagrafica(null)).toBeNull();
    expect(formaAERdaAnagrafica('')).toBeNull();
    expect(formaAERdaAnagrafica('Consorzio')).toBeNull();
    expect(formaAERdaAnagrafica('Ente non commerciale')).toBeNull();
  });

  it('è indifferente a punti, spazi e maiuscole', () => {
    expect(formaAERdaAnagrafica('s r l')).toBe('ALTRE_SOCIETA');
    expect(formaAERdaAnagrafica('  S.N.C.  ')).toBe('SOCIETA_PERSONE');
  });
});
