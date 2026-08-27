import { describe, it, expect } from 'vitest';
import { richiedeCambioPassword } from './passwordTemporanea';

// Questa regola decide se un utente autenticato può entrare o viene
// rimandato al cambio password. Un falso positivo qui non è un dettaglio
// estetico: chiude fuori dalla piattaforma un utente con credenziali
// valide, e senza messaggi (il rimbalzo è muto). Da qui i casi limite.

describe('richiedeCambioPassword', () => {
  it('NULL significa password propria già scelta', () => {
    expect(richiedeCambioPassword(null)).toBe(false);
  });

  it('colonna assente / non letta è trattata come NULL', () => {
    expect(richiedeCambioPassword(undefined)).toBe(false);
  });

  it('una password temporanea vera obbliga al cambio', () => {
    expect(richiedeCambioPassword('Xk9-2mQr')).toBe(true);
  });

  it('la stringa VUOTA non è una password temporanea', () => {
    // Il caso che ha bloccato l'accesso nell'edizione portable: l'admin
    // nasceva con password_temporanea = '' e il confronto `!== null`
    // lo mandava in loop sul cambio password.
    expect(richiedeCambioPassword('')).toBe(false);
  });

  it('una stringa di soli spazi non è una password temporanea', () => {
    expect(richiedeCambioPassword('   ')).toBe(false);
    expect(richiedeCambioPassword('\t\n')).toBe(false);
  });

  it('gli spazi attorno a una password vera non la annullano', () => {
    expect(richiedeCambioPassword('  Xk9-2mQr  ')).toBe(true);
  });
});
