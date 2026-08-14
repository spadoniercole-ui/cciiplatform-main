// src/lib/parametriPeriodi.ts
//
// Quanti anni di storico XBRL mostrare al massimo (i più recenti) nella
// vista Indici multi-periodo e nella Posizione Aggiornata. È un parametro
// PER-SPAZIO con un default di sistema: ogni Admin di Spazio può alzarlo o
// abbassarlo entro un intervallo consentito (vedi Parametri di Spazio →
// Storico XBRL a video); se non lo tocca, vale il default di sistema.
//
// L'archivio (xbrl_storico_azienda) conserva comunque TUTTI gli anni: qui
// si governa solo quanti mostrarne a video, non quanti conservarne.

/** Valore usato quando lo spazio non ha impostato un proprio orizzonte. */
export const MAX_ANNI_STORICO_DEFAULT = 5;

/** Minimo consentito per l'override di spazio (almeno un anno a video). */
export const MIN_ANNI_STORICO = 1;

/** Massimo consentito per l'override di spazio: oltre, la tabella diventa
 * insostenibile a video (scroll orizzontale eccessivo). */
export const MAX_ANNI_STORICO_LIMITE = 10;

/** Riconduce un valore grezzo (da DB o da input) nell'intervallo consentito;
 * null/undefined → default di sistema. */
export function normalizzaAnniStorico(grezzo: number | null | undefined): number {
  if (grezzo === null || grezzo === undefined || Number.isNaN(grezzo)) {
    return MAX_ANNI_STORICO_DEFAULT;
  }
  return Math.min(MAX_ANNI_STORICO_LIMITE, Math.max(MIN_ANNI_STORICO, Math.trunc(grezzo)));
}
