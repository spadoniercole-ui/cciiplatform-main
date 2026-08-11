// src/lib/moduliPermesso.ts
//
// Moduli soggetti a permesso granulare per Utente (Operativo/Consultatore).
// In un file separato perché i file 'use server' possono esportare solo
// funzioni async: una costante qui dentro fa fallire la build (stesso
// principio già visto con RUOLI_ADMIN_SPAZIO e ORIGINI_PER_TIPO).
//
// NOTA: 'report' è la chiave storica del modulo "Proposta" (acquisizione +
// ricevibilità) — l'etichetta mostrata è cambiata, la chiave no, per non
// invalidare i permessi già assegnati dagli Admin di Spazio esistenti.
// 'relazione' è nuovo: la generazione della Relazione AI, ora un passo a
// sé, sbloccato solo a flusso completo.

export const MODULI_PERMESSO = [
  'scenari',
  'checklist',
  'indici',
  'xbrl',
  'report',
  'relazione',
  'simulazione',
] as const;
export type Modulo = (typeof MODULI_PERMESSO)[number];
export type LivelloPermesso = 'NESSUNO' | 'LETTURA' | 'SCRITTURA';
