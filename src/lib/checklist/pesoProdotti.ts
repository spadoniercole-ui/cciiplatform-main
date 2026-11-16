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
 * La soglia più conservativa della valutazione pesata (0.241.0).
 *
 * La percentuale di criticità pesata della Check List ha le sue soglie in
 * `src/lib/checklist/scoring.ts` (20 e 50). Qui si prende la più alta: al 50% il
 * quadro è sfavorevole comunque, e la check list dei prodotti non può
 * migliorarlo — può solo arrivare alla stessa conclusione per un'altra via.
 */
export const SOGLIA_QUADRO_PESATO_PCT = 50;
/** Sotto questa percentuale di criticità pesata il quadro è contenuto. */
export const SOGLIA_QUADRO_CONTENUTO_PCT = 20;

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
 * L'ESITO QUALITATIVO SOMMARIO (0.241.0): la regola dei due terzi e la
 * valutazione pesata, con la più conservativa che vince.
 *
 * La check list dei prodotti si conta (quante risposte chiuse sono negative);
 * la ministeriale si pesa (percentuale di criticità). Sono due letture della
 * stessa cosa e non possono compensarsi: si prende la peggiore. Se una delle
 * due manca, vale l'altra; se mancano entrambe la dimensione resta scoperta
 * (null), che è diverso da «verde».
 */
export function coloreQualitativoSommario(input: {
  qualificazione: QualificazioneChecklist | null | undefined;
  /** Percentuale di criticità pesata della Check List; null se non compilata. */
  percentualeCriticitaPesata: number | null | undefined;
}): 'verde' | 'giallo' | 'rosso' | null {
  const prodotti = coloreDaQualificazione(input.qualificazione);
  const pesata =
    typeof input.percentualeCriticitaPesata === 'number' &&
    Number.isFinite(input.percentualeCriticitaPesata)
      ? input.percentualeCriticitaPesata
      : null;
  const dalPeso =
    pesata === null
      ? null
      : pesata >= SOGLIA_QUADRO_PESATO_PCT
        ? ('rosso' as const)
        : pesata > SOGLIA_QUADRO_CONTENUTO_PCT
          ? ('giallo' as const)
          : ('verde' as const);

  if (prodotti === null && dalPeso === null) return null;
  const ordine = { verde: 0, giallo: 1, rosso: 2 } as const;
  const scelte = [prodotti, dalPeso].filter((c): c is 'verde' | 'giallo' | 'rosso' => c !== null);
  return scelte.reduce((peggiore, c) => (ordine[c] > ordine[peggiore] ? c : peggiore));
}

/**
 * Che cosa dice l'orientamento, con i suoi numeri: la quota di risposte
 * negative (con la regola dei due terzi) e, se c'è, la percentuale pesata con
 * la sua soglia più conservativa.
 */
export function dettaglioOrientamentoSommario(
  sintesi: SintesiChecklistProdotti,
  percentualeCriticitaPesata: number | null
): string {
  const quota =
    sintesi.percentualeNegative !== null
      ? `${sintesi.negative} risposte chiuse su ${sintesi.positive + sintesi.negative} lette come negative (${sintesi.percentualeNegative}%${sintesi.sfavorevolePerDueTerzi ? ', oltre i due terzi: orientamento sfavorevole' : ''})`
      : 'nessuna risposta chiusa da contare';
  const peso =
    percentualeCriticitaPesata !== null
      ? ` La valutazione pesata della Check List è al ${percentualeCriticitaPesata}% di criticità (soglia più conservativa ${SOGLIA_QUADRO_PESATO_PCT}%): fra le due si legge la più severa.`
      : ' La valutazione pesata della Check List non è ancora compilata: vale la sola quota delle risposte.';
  return `Check list — orientamento sommario: ${quota}.${peso}`;
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
