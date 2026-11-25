import { describe, expect, it } from 'vitest';
import { tonoDelDato, tonoDellIntensita } from './toni';

describe('tonoDelDato', () => {
  it('positivo, negativo, neutro', () => {
    expect(tonoDelDato({ valore: 10 })).toBe('positivo');
    expect(tonoDelDato({ valore: -10 })).toBe('negativo');
    expect(tonoDelDato({ valore: 0 })).toBe('neutro');
  });

  it('un fatto sfavorevole resta negativo anche se il numero è positivo', () => {
    expect(tonoDelDato({ valore: 10, segnala: true })).toBe('negativo');
  });

  it('senza valore non si interpreta: un colore solo', () => {
    expect(tonoDelDato({ valore: null })).toBe('nonInterpretabile');
  });
});

describe('tonoDellIntensita', () => {
  it('alta intensità sfavorevole, bassa neutra, zero non misurata', () => {
    expect(tonoDellIntensita(60)).toBe('negativo');
    expect(tonoDellIntensita(10)).toBe('neutro');
    expect(tonoDellIntensita(0)).toBe('nonInterpretabile');
  });
});
