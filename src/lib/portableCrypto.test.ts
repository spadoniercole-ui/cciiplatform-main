import { describe, it, expect } from 'vitest';
import { cifra, decifra } from './portableCrypto';

// Formato: [ salt(16) | iv(12) | authTag(16) | ciphertext(N) ]
const SALT = 16;
const IV = 12;
const TAG = 16;
const INTESTAZIONE = SALT + IV + TAG;

const PASSPHRASE = 'passphrase di prova — con accenti àèìòù';
const DATI = Buffer.from('dump del database PGlite: dati riservati del tenant', 'utf8');

function alterato(blob: Buffer, posizione: number): Buffer {
  const copia = Buffer.from(blob);
  copia[posizione] ^= 0x01;
  return copia;
}

describe('portableCrypto', () => {
  const blob = cifra(DATI, PASSPHRASE);

  it('andata e ritorno restituisce i dati originali', () => {
    expect(decifra(blob, PASSPHRASE).equals(DATI)).toBe(true);
  });

  it('il blob ha la lunghezza del formato dichiarato (AES-GCM non aggiunge padding)', () => {
    expect(blob.length).toBe(INTESTAZIONE + DATI.length);
  });

  it('il testo in chiaro non compare nel blob', () => {
    expect(blob.includes(DATI)).toBe(false);
    expect(blob.includes(Buffer.from('riservati'))).toBe(false);
  });

  it('passphrase errata → errore, mai dati corrotti', () => {
    expect(() => decifra(blob, 'passphrase sbagliata')).toThrow();
    expect(() => decifra(blob, '')).toThrow();
  });

  it('byte alterato nel testo cifrato → errore', () => {
    expect(() => decifra(alterato(blob, INTESTAZIONE), PASSPHRASE)).toThrow();
    expect(() => decifra(alterato(blob, blob.length - 1), PASSPHRASE)).toThrow();
  });

  it('byte alterato nel tag di autenticazione → errore', () => {
    expect(() => decifra(alterato(blob, SALT + IV), PASSPHRASE)).toThrow();
    expect(() => decifra(alterato(blob, INTESTAZIONE - 1), PASSPHRASE)).toThrow();
  });

  it('byte alterato nel salt → errore', () => {
    expect(() => decifra(alterato(blob, 0), PASSPHRASE)).toThrow();
    expect(() => decifra(alterato(blob, SALT - 1), PASSPHRASE)).toThrow();
  });

  it('byte alterato nell’IV → errore', () => {
    expect(() => decifra(alterato(blob, SALT), PASSPHRASE)).toThrow();
    expect(() => decifra(alterato(blob, SALT + IV - 1), PASSPHRASE)).toThrow();
  });

  it('blob troncato → errore', () => {
    // Un byte in meno di testo cifrato.
    expect(() => decifra(blob.subarray(0, blob.length - 1), PASSPHRASE)).toThrow();
    // Intestazione integra, testo cifrato assente.
    expect(() => decifra(blob.subarray(0, INTESTAZIONE), PASSPHRASE)).toThrow();
    // Tag incompleto.
    expect(() => decifra(blob.subarray(0, SALT + IV + 5), PASSPHRASE)).toThrow();
    // Solo parte del salt, e blob vuoto.
    expect(() => decifra(blob.subarray(0, 10), PASSPHRASE)).toThrow();
    expect(() => decifra(Buffer.alloc(0), PASSPHRASE)).toThrow();
  });

  it('byte aggiunti in coda → errore', () => {
    expect(() => decifra(Buffer.concat([blob, Buffer.from([0])]), PASSPHRASE)).toThrow();
  });

  it('due cifrature degli stessi dati sono diverse (salt e IV casuali)', () => {
    const altro = cifra(DATI, PASSPHRASE);
    expect(altro.equals(blob)).toBe(false);
    expect(altro.subarray(0, SALT).equals(blob.subarray(0, SALT))).toBe(false);
    expect(altro.subarray(SALT, SALT + IV).equals(blob.subarray(SALT, SALT + IV))).toBe(false);
    expect(decifra(altro, PASSPHRASE).equals(DATI)).toBe(true);
  });

  it('payload vuoto: andata e ritorno', () => {
    const vuoto = cifra(Buffer.alloc(0), PASSPHRASE);
    expect(vuoto.length).toBe(INTESTAZIONE);
    expect(decifra(vuoto, PASSPHRASE).length).toBe(0);
  });

  it('payload vuoto: passphrase errata o tag alterato → errore', () => {
    const vuoto = cifra(Buffer.alloc(0), PASSPHRASE);
    expect(() => decifra(vuoto, 'altra')).toThrow();
    expect(() => decifra(alterato(vuoto, SALT + IV), PASSPHRASE)).toThrow();
  });

  it('dati binari arbitrari (tutti i 256 valori di byte)', () => {
    const binari = Buffer.from(Array.from({ length: 1024 }, (_, i) => i & 0xff));
    expect(decifra(cifra(binari, PASSPHRASE), PASSPHRASE).equals(binari)).toBe(true);
  });

  it('passphrase vuota: funziona ma solo con sé stessa', () => {
    const b = cifra(DATI, '');
    expect(decifra(b, '').equals(DATI)).toBe(true);
    expect(() => decifra(b, ' ')).toThrow();
  });
});
