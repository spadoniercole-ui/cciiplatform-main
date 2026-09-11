// src/lib/screening/conservazioneVisura.ts
//
// Quando il file della visura va eliminato dopo una generazione di screening.
//
// La regola della piattaforma è che i documenti non si conservano. Applicata
// senza distinzioni, però, distruggeva anche la visura TRATTENUTA dal triage
// quando la generazione FALLIVA — bastavano i crediti esauriti o l'AI non
// raggiungibile perché il documento appena fornito sparisse e lo si dovesse
// ricaricare a mano. Cioè proprio il caso in cui la conservazione serviva.
//
// LA REGOLA CORRETTA: si distrugge quando il documento ha finito il suo
// lavoro, non quando il lavoro è stato soltanto tentato.
//
// Resta fermo tutto il resto: un file caricato adesso per questa generazione
// si elimina comunque, riuscita o fallita che sia — è stato fornito per
// questa operazione e non deve sopravviverle.

export function deveEliminareVisura(
  /** La generazione dello screening è andata a buon fine? */
  generazioneRiuscita: boolean,
  /** Il file in uso è la visura trattenuta dal triage? */
  eraTrattenuta: boolean
): boolean {
  if (generazioneRiuscita) return true;
  // Generazione fallita: sopravvive solo la visura trattenuta.
  return !eraTrattenuta;
}
