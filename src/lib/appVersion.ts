// src/lib/appVersion.ts
//
// DUE linee di versione, deliberatamente indipendenti, per non confondere
// la piattaforma cloud con l'edizione portable stand-alone:
//
//   - APP_VERSION      → versione CLOUD (il codice servito da Vercel).
//                        Allineata a "version" in package.json.
//   - PORTABLE_VERSION → versione dell'EDIZIONE PORTABLE (chiavetta USB).
//                        Contatore proprio: avanza solo per il lavoro
//                        portable, non tocca il numero cloud.
//
// La barra di stato (TopStatusBar) mostra l'una o l'altra a seconda che il
// bundle sia stato compilato per la portable (NEXT_PUBLIC_PORTABLE=1, che
// build-portable.mjs imposta al build) o per il cloud.
//
// Tenute a mano in sync ad ogni consegna; non lette dinamicamente dal
// package.json per non includerlo nel bundle client.

export const APP_VERSION = '0.109.2';

export const PORTABLE_VERSION = '1.0.0';
