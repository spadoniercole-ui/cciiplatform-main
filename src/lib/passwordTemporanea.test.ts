import { describe, it, expect } from 'vitest';
import { richiedeCambioPassword } from './passwordTemporanea';

// Un falso positivo qui non è un dettaglio estetico: chiude fuori dalla
// piattaforma un utente con credenziali valide, e senza messaggi.

describe('richiedeCambioPassword', () => {
  it('NULL significa password propria già scelta', () => {
    expect(richiedeCambioPassword(null)).toBe(false);
    expect(richiedeCambioPassword(undefined)).toBe(false);
  });

  it('una password temporanea vera obbliga al cambio', () => {
    expect(richiedeCambioPassword('Xk9-2mQr')).toBe(true);
    expect(richiedeCambioPassword('  Xk9-2mQr  ')).toBe(true);
  });

  it('la stringa VUOTA non è una password temporanea', () => {
    // Il caso che ha bloccato l'accesso nell'edizione portable.
    expect(richiedeCambioPassword('')).toBe(false);
  });

  it('una stringa di soli spazi non è una password temporanea', () => {
    expect(richiedeCambioPassword('   ')).toBe(false);
    expect(richiedeCambioPassword('\t\n')).toBe(false);
  });
});
