// src/lib/file/accumula.ts
//
// Un campo di caricamento del browser SOSTITUISCE il proprio elenco a ogni
// nuova scelta. Prendendolo così com'era, chi caricava un secondo bilancio
// perdeva il primo — funzionava solo selezionando tutti i file insieme nella
// finestra, cosa che nessuno fa. Qui si accumulano.
//
// Un file già presente con lo stesso nome e la stessa dimensione non si
// aggiunge due volte: è lo stesso file scelto di nuovo, non uno diverso.

export function accumulaFile(esistenti: File[], nuovi: File[]): File[] {
  const chiave = (f: File) => `${f.name}|${f.size}`;
  const visti = new Set(esistenti.map(chiave));
  const aggiunti = nuovi.filter((f) => !visti.has(chiave(f)));
  return [...esistenti, ...aggiunti];
}

export function togliFile(esistenti: File[], daTogliere: File): File[] {
  return esistenti.filter((f) => f !== daTogliere);
}
