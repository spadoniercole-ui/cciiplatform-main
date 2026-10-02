// src/lib/screening/conservazioneVisura.ts
//
// Quando il file della visura va eliminato dopo una generazione di screening.
//
// 0.118: la visura TRATTENUTA è il documento di riferimento dell'azienda e
// resta finché non viene sostituita da una più recente (la sostituzione
// elimina la precedente, vedi registraVisuraTriageAction). Prima veniva
// distrutta a ogni screening riuscito: per rilanciare l'elaborazione — o
// per farla ripartire dopo aver salvato i parametri dell'ente — la si
// doveva ricercare e ricaricare ogni volta, ed era proprio il costo che i
// riferimenti interni dell'ente devono evitare.
//
// Resta fermo il resto: un file caricato per una sola operazione e NON
// registrato come visura dell'azienda si elimina comunque, riuscita o
// fallita che sia.

export function deveEliminareVisura(
  /** La generazione dello screening è andata a buon fine? (non decide più) */
  _generazioneRiuscita: boolean,
  /** Il file in uso è la visura trattenuta per l'azienda? */
  eraTrattenuta: boolean
): boolean {
  return !eraTrattenuta;
}
