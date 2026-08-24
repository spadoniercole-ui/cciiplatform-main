// Piccolo prompt libero che l'operatore può inserire "un attimo prima" di
// lanciare una generazione AI (Screening, Brogliaccio, Analisi proposta) per
// dare indicazioni specifiche a quella singola esecuzione. È usa-e-getta: non
// viene salvato, vale solo per il lancio corrente.
//
// Il blocco è deliberatamente subordinato alle regole già presenti nel prompt:
// non può violarle (polarità, niente giudizi legali definitivi, non inventare
// dati). Un tetto di lunghezza evita che un incolla accidentale gonfi il prompt.

const MAX_ISTRUZIONI = 2000;

export function bloccoIstruzioniOperatore(istruzioni?: string | null): string {
  const t = (istruzioni || '').trim();
  if (!t) return '';
  const testo = t.length > MAX_ISTRUZIONI ? t.slice(0, MAX_ISTRUZIONI) : t;
  return `\n\nISTRUZIONI AGGIUNTIVE DELL'OPERATORE per questa specifica generazione — indicazioni da tenere in considerazione. NON possono violare le regole e i vincoli già indicati sopra (formulazione/polarità, niente giudizi legali definitivi, non inventare dati mancanti): in caso di conflitto prevalgono sempre le regole. Istruzioni: ${testo}`;
}
