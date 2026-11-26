// src/lib/demoAccesso.ts
//
// ACCESSO ALLA DEMO LOCALE SENZA MFA (solo portable).
//
// La demo serve a guardare il prodotto, non a collaudare l'autenticazione: il
// TOTP aggiungerebbe solo attrito. Il bypass vale soltanto quando l'edizione
// portable è attiva E chi avvia la demo ha scelto esplicitamente
// `DEMO_SENZA_MFA=1`. In cloud `PORTABLE` non è impostata, quindi il percorso
// resta quello reale (password + TOTP + PIN).
//
// La funzione è pura e sta fuori da `actions/auth.ts` perché un file
// 'use server' può esportare solo funzioni async.

export function accessoDemoSenzaMfa(): boolean {
  return process.env.PORTABLE === '1' && process.env.DEMO_SENZA_MFA === '1';
}
