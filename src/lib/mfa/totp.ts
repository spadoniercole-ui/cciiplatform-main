// src/lib/mfa/totp.ts
//
// TOTP (RFC 6238) implementato con la sola crypto nativa di Node: nessuna
// dipendenza esterna, nessun servizio da configurare. Genera il segreto,
// costruisce l'URI otpauth:// per l'enrollment su app authenticator
// (Google/Microsoft Authenticator, Aruba OTP, …) e verifica i codici a 6
// cifre con una finestra di tolleranza di ±1 step (30s), per assorbire il
// piccolo sfasamento d'orologio tra server e telefono.

import crypto from 'crypto';

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // RFC 4648, senza padding
const PASSO_SECONDI = 30;
const CIFRE = 6;

/** Codifica un buffer in Base32 (RFC 4648, senza '='). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let valore = 0;
  let out = '';
  for (const byte of buf) {
    valore = (valore << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO_BASE32[(valore >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALFABETO_BASE32[(valore << (5 - bits)) & 31];
  }
  return out;
}

/** Decodifica una stringa Base32 (ignora spazi e padding) in buffer. */
export function base32Decode(input: string): Buffer {
  const pulito = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let valore = 0;
  const byteArray: number[] = [];
  for (const ch of pulito) {
    const idx = ALFABETO_BASE32.indexOf(ch);
    if (idx === -1) continue; // carattere non valido: ignorato
    valore = (valore << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      byteArray.push((valore >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(byteArray);
}

/** Genera un nuovo segreto TOTP casuale, in Base32 (default 20 byte = 160 bit). */
export function generaSegretoBase32(byte = 20): string {
  return base32Encode(crypto.randomBytes(byte));
}

/** Costruisce l'URI otpauth:// da mostrare come QR / chiave manuale. */
export function otpauthUri(segretoBase32: string, etichetta: string, emittente: string): string {
  const label = encodeURIComponent(`${emittente}:${etichetta}`);
  const params = new URLSearchParams({
    secret: segretoBase32,
    issuer: emittente,
    algorithm: 'SHA1',
    digits: String(CIFRE),
    period: String(PASSO_SECONDI),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** HOTP (RFC 4226) per un dato contatore. */
function hotp(segreto: Buffer, contatore: number): string {
  const buf = Buffer.alloc(8);
  // Contatore a 64 bit big-endian (i 32 bit alti restano 0 fino all'anno ~10889).
  buf.writeUInt32BE(Math.floor(contatore / 0x100000000), 0);
  buf.writeUInt32BE(contatore >>> 0, 4);
  const hmac = crypto.createHmac('sha1', segreto).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const codice = binario % 10 ** CIFRE;
  return codice.toString().padStart(CIFRE, '0');
}

/** Codice TOTP corrente per un dato istante (default: adesso). */
export function codiceTotp(segretoBase32: string, nowMs: number = Date.now()): string {
  const step = Math.floor(nowMs / 1000 / PASSO_SECONDI);
  return hotp(base32Decode(segretoBase32), step);
}

/**
 * Verifica un codice TOTP con finestra ±`finestra` step. Confronto a tempo
 * costante per non rivelare via timing quante cifre sono corrette.
 */
export function verificaTotp(
  segretoBase32: string,
  codiceInserito: string,
  finestra = 1,
  nowMs: number = Date.now()
): boolean {
  const codice = String(codiceInserito || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(codice)) return false;
  const segreto = base32Decode(segretoBase32);
  if (segreto.length === 0) return false;
  const stepCorrente = Math.floor(nowMs / 1000 / PASSO_SECONDI);
  for (let w = -finestra; w <= finestra; w++) {
    const atteso = hotp(segreto, stepCorrente + w);
    const a = Buffer.from(atteso);
    const b = Buffer.from(codice);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}
