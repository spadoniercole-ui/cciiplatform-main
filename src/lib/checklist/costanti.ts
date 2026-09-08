// src/lib/checklist/costanti.ts
//
// Costante condivisa tra azioni server e componenti client — in un file
// separato (non 'use server') per lo stesso motivo di
// src/lib/moduliPermesso.ts, src/lib/origineProposta.ts ecc.: un file
// 'use server' può esportare SOLO funzioni async.

/** Chiave riservata per la Check List Ministeriale nelle risposte (checklist_risposte.modello_chiave). Tutte le altre chiavi sono id numerici (come stringa) di checklist_modelli. */
export const MODELLO_MINISTERIALE = 'MINISTERIALE';
