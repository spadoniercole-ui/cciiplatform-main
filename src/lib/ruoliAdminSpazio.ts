// src/lib/ruoliAdminSpazio.ts
//
// Elenco fisso dei ruoli assegnabili all'Admin di Spazio. In un file
// separato (non 'use server') perché i file "use server" possono esportare
// solo funzioni async: una costante qui dentro fa fallire la build.

export const RUOLI_ADMIN_SPAZIO = [
  'Titolare',
  'Legale Rappresentante',
  'Responsabile Amministrativo',
  'Responsabile IT',
  'Collaboratore',
] as const;

export type RuoloAdminSpazio = (typeof RUOLI_ADMIN_SPAZIO)[number];
