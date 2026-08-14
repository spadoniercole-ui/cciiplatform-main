// src/lib/portableCrypto.ts
//
// Cifratura a riposo del database dell'edizione portable. Il dump del DB
// (PGlite) non tocca mai il disco in chiaro: viene cifrato con AES-256-GCM,
// chiave derivata dalla passphrase inserita all'avvio (scrypt). In chiaro
// esiste solo in RAM durante la sessione. Formato del file:
//   [ salt(16) | iv(12) | authTag(16) | ciphertext(N) ]
// Il tag GCM garantisce integrità: una passphrase errata fa fallire la
// decifratura, non produce dati corrotti silenziosi.

import crypto from 'node:crypto';

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function derivaChiave(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32);
}

export function cifra(dati: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const chiave = derivaChiave(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', chiave, iv);
  const ct = Buffer.concat([cipher.update(dati), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ct]);
}

export function decifra(blob: Buffer, passphrase: string): Buffer {
  const salt = blob.subarray(0, SALT_LEN);
  const iv = blob.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = blob.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ct = blob.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const chiave = derivaChiave(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', chiave, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
