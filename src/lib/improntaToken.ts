// src/lib/improntaToken.ts
//
// Nel database non si conserva il token di sessione ma la sua impronta
// SHA-256. Il token vive solo nel cookie del browser: chi ottiene una copia
// del database o di un backup non trova sessioni da riusare. Un token è di
// 256 bit casuali, quindi l'hash semplice (senza sale) basta: non c'è nulla
// da indovinare per dizionario.
import crypto from 'crypto';

export function improntaToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
