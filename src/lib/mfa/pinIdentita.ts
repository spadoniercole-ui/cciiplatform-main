// src/lib/mfa/pinIdentita.ts
//
// Le regole del PIN del secondo fattore, senza database: formato, identità e
// chiave dei tentativi. Stanno in un modulo a sé perché il verificatore
// (pinSessione.ts) tocca Postgres e la sessione, e qui si vuole poter provare
// la parte pura senza simulare né l'uno né l'altra.

export type RuoloSessione = 'SUPERADMIN' | 'USER';

/**
 * Il PIN nuovo è di 6 cifre; quelli già impostati a 4 o 5 restano validi
 * finché l'utente non li cambia (stessa regola dell'accesso).
 */
export function pinBenFormato(pin: string): boolean {
  return /^\d{4,6}$/.test(String(pin ?? '').trim());
}

/**
 * La chiave dell'identità, la stessa costruita al login (src/app/actions/auth.ts):
 * `SUPER:<username>` per il Superadmin, `USER:<username>` per gli utenti.
 * Se manca lo username non c'è un'identità su cui verificare il PIN.
 */
export function identitaKeyDaSessione(sessione: {
  ruolo: RuoloSessione;
  username: string | null;
}): string | null {
  const username = sessione.username?.trim();
  if (!username) return null;
  return sessione.ruolo === 'SUPERADMIN' ? `SUPER:${username}` : `USER:${username}`;
}

/**
 * Chiave dei tentativi SEPARATA da quella dell'accesso: sbagliare il PIN di
 * un atto non deve consumare i tentativi di login, e viceversa.
 */
export function chiaveTentativiPin(identitaKey: string): string {
  return `PIN_SCENARIO:${identitaKey}`;
}
