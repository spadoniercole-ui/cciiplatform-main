// src/lib/checklist/pesoProdotti.ts
//
// IL PESO DELLA CHECK LIST DEI PRODOTTI (0.220.0).
//
// LA CHECK LIST CHE QUALIFICA IL CASO È QUELLA DEI PRODOTTI, non quella
// ministeriale. La seconda si compila — nella peggiore delle ipotesi — nella
// fase redigente, cioè quando la lettura è già stata fatta: usarla come
// qualificazione significherebbe far dipendere la valutazione da un documento
// che arriva dopo. Le domande dei prodotti, invece, si rispondono nel triage,
// prima dell'esito, e sono già il quadro qualitativo che il sistema usa nella
// Relazione del Ricevente.
//
// QUI SI DICE SOLO QUANTO PESA, NON CHE COSA DECIDERE. La qualificazione è
// dell'operatore: il conteggio delle risposte positive e negative racconta se
// la storia dell'azienda parla di un'azione voluta o di uno squilibrio. Non è
// un accertamento di crisi e non sostituisce le soglie, che si misurano sugli
// importi. Per questo il quadro può peggiorare l'indicatore ma non migliorarlo,
// e non lo porta mai al rosso da solo.

import type { QualificazioneChecklist, SintesiChecklistProdotti } from '@/lib/prodotti/prodotti';

/**
 * La check list è completa quando ogni domanda dei prodotti in check list ha
 * una risposta. Senza prodotti in check list non c'è nulla da chiedere: non è
 * «completa», è assente, e la dimensione resta scoperta.
 */
export function checklistProdottiCompleta(
  sintesi: SintesiChecklistProdotti | null | undefined
): boolean {
  return !!sintesi && sintesi.totale > 0 && sintesi.mancanti === 0;
}

/**
 * Dalla qualificazione al colore dell'indicatore.
 *
 * `NON_VALUTABILE` non diventa «grigio»: diventa `null`, cioè una dimensione
 * non determinata. Un grigio sarebbe una neutralità dichiarata senza aver
 * guardato niente, ed è esattamente il tipo di silenzio che l'indicatore non
 * deve produrre.
 */
export function coloreDaQualificazione(
  qualificazione: QualificazioneChecklist | null | undefined
): 'verde' | 'giallo' | 'rosso' | null {
  switch (qualificazione) {
    case 'SISTEMICA':
      return 'verde';
    case 'DA_APPROFONDIRE':
      return 'giallo';
    case 'SQUILIBRIO':
      return 'rosso';
    default:
      return null;
  }
}

/**
 * Che cosa dice il quadro, con i suoi numeri: senza numeri, «quadro misto» non
 * dice se le risposte sono due o tutte, e un peso non si può controllare.
 */
export function dettaglioQualificazioneProdotti(sintesi: SintesiChecklistProdotti): string {
  const chiuse =
    sintesi.chiuse > 0
      ? ` ${sintesi.positive} risposte lette come positive e ${sintesi.negative} come negative sulle ${sintesi.chiuse} domande chiuse.`
      : ' Nessuna domanda a risposta chiusa: la qualificazione viene dalle domande a testo libero.';
  return `Check list dei prodotti — ${sintesi.etichetta}.${chiuse} ${sintesi.risposte}/${sintesi.totale} risposte date. Concorre all’esito, non lo migliora.`;
}
