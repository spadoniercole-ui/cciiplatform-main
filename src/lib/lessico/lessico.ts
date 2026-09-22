// src/lib/lessico/lessico.ts
//
// LESSICO CONTROLLATO — parte C dei materiali di Libra (consegna 3 di 6),
// 19 termini in quattro classi. E' un DATO del sistema, non una convenzione
// di stile: lo usano il test che sorveglia i testi dell'applicativo
// (lessico.sorgenti.test.ts) e il revisore a regole sugli output generati.
//
// Perche' esiste: una parola come «ricevibile» o «solido» fa percepire un
// calcolo come un giudizio giuridico o prognostico. La piattaforma rileva
// dati, calcoli, soglie e lacune; il giudizio resta al professionista,
// all'ente e al tribunale.
//
// Le formule sostitutive sono quelle di Libra. Dove la piattaforma fa una
// cosa diversa da cio' che la formula descrive, vale la scelta di Ercole
// annotata in `notaPiattaforma` (es. «ricevibile»: la verifica confronta
// l'offerta con i parametri dell'ente, non misura la completezza dei
// documenti — la formula giusta e' quella di «conforme»).

import { FONTI } from '@/lib/registroFonti/fonti';

export type ClasseLessico =
  | 'VIETATO_AUTOMATICO'
  | 'CONSENTITO_QUALIFICATO'
  | 'CONSENTITO_TECNICO'
  | 'RISERVATO_PROFESSIONISTA';

export interface VoceLessico {
  id: string;
  termine: string;
  classe: ClasseLessico;
  /** Riconosce il termine e le sue flessioni in un testo. Sempre con flag `giu`. */
  modello: RegExp;
  formulaSostitutiva: string;
  /** null = il termine non va usato affatto. */
  qualificazione: string | null;
  /**
   * true = il termine non ha usi innocenti nei testi dell'applicativo: il test
   * sui sorgenti lo blocca ovunque. false = dipende dal contesto («crisi» in
   * «composizione negoziata della crisi» e' una citazione, in «l'azienda e' in
   * crisi» e' un giudizio): lo esamina il revisore sugli output generati.
   */
  sorvegliatoNeiSorgenti: boolean;
  notaPiattaforma?: string;
}

// I confini di parola di JavaScript non conoscono le lettere accentate:
// si usano lookaround espliciti sulle lettere italiane.
const L = 'A-Za-zÀ-ÖØ-öø-ÿ';
const parola = (corpo: string) => new RegExp(`(?<![${L}])(?:${corpo})(?![${L}])`, 'giu');

export const LESSICO: VoceLessico[] = [
  {
    id: 'LEX-RICEVIBILE',
    termine: 'ricevibile',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('(?:ir)?ricevibil(?:e|i|ità|mente)'),
    formulaSostitutiva:
      'Documentazione istruttoriamente completa/incompleta rispetto ai requisiti configurati per [strumento].',
    qualificazione:
      'Il controllo non esprime un giudizio di ricevibilità, ammissibilità o omologabilità.',
    sorvegliatoNeiSorgenti: true,
    notaPiattaforma:
      'La verifica della piattaforma confronta la percentuale offerta con i parametri configurati dall’ente: si usa «Coerente / Non coerente con i parametri configurati» (formula di «conforme»), «Riscontro con i parametri dell’ente», «Parametri di riscontro della proposta».',
  },
  {
    id: 'LEX-AMMISSIBILE',
    termine: 'ammissibile',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('(?:in)?ammissibil(?:e|i|ità)'),
    formulaSostitutiva: 'Sono rilevati/non rilevati i requisiti documentali minimi.',
    qualificazione:
      'L’ammissibilità dipende da presupposti giuridici e fattuali non integralmente automatizzabili.',
    sorvegliatoNeiSorgenti: true,
  },
  {
    id: 'LEX-CONVENIENTE',
    termine: 'conveniente',
    classe: 'RISERVATO_PROFESSIONISTA',
    modello: parola('convenient[ei]'),
    formulaSostitutiva:
      'Confronto quantitativo tra scenario proposto e scenario liquidatorio disponibile/non disponibile.',
    qualificazione:
      'Il confronto è elaborato sulle assunzioni indicate e non costituisce attestazione di convenienza.',
    sorvegliatoNeiSorgenti: false,
  },
  {
    id: 'LEX-NON-DETERIORE',
    termine: 'non deteriore',
    classe: 'RISERVATO_PROFESSIONISTA',
    modello: parola('non\\s+deterior[ei]'),
    formulaSostitutiva:
      'Trattamento proposto comparato con i recuperi stimati nella liquidazione giudiziale.',
    qualificazione:
      'La verifica di non deteriorità è riservata al professionista indipendente nei casi previsti dalla legge.',
    sorvegliatoNeiSorgenti: false,
  },
  {
    id: 'LEX-SOSTENIBILE',
    termine: 'sostenibile',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('(?:in)?sostenibil(?:e|i)'),
    formulaSostitutiva:
      'I flussi previsionali disponibili coprono/non coprono le uscite modellate nel periodo [periodo].',
    qualificazione:
      'Il calcolo non equivale a valutazione di sostenibilità del debito o della continuità.',
    sorvegliatoNeiSorgenti: false,
    notaPiattaforma:
      'Il sostantivo «sostenibilità» compare nella norma (art. 3 CCII) e nel nome di una funzione della piattaforma: il revisore esamina l’aggettivo usato come esito.',
  },
  {
    id: 'LEX-SOLIDO',
    termine: 'solido',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('solid[oaie]|solidità'),
    formulaSostitutiva:
      'Piano con dati completi/incompleti e assunzioni documentate/non documentate.',
    qualificazione: null,
    sorvegliatoNeiSorgenti: true,
  },
  {
    id: 'LEX-CRITICO',
    termine: 'critico',
    classe: 'CONSENTITO_QUALIFICATO',
    modello: parola('critic[oaie]|criticità'),
    formulaSostitutiva: 'Scostamento rilevante rispetto alla soglia/assunzione [identificativo].',
    qualificazione:
      'Criticità istruttoria o quantitativa; non costituisce accertamento di crisi o insolvenza.',
    sorvegliatoNeiSorgenti: false,
  },
  {
    id: 'LEX-FATTIBILE',
    termine: 'fattibile',
    classe: 'RISERVATO_PROFESSIONISTA',
    modello: parola('fattibil(?:e|i|ità)'),
    formulaSostitutiva:
      'Sono disponibili/non disponibili gli elementi istruttori per valutare l’esecuzione del piano.',
    qualificazione: 'L’elaborazione non costituisce giudizio di fattibilità.',
    sorvegliatoNeiSorgenti: false,
  },
  {
    id: 'LEX-RAGIONEVOLMENTE-PERSEGUIBILE',
    termine: 'ragionevolmente perseguibile',
    classe: 'RISERVATO_PROFESSIONISTA',
    modello: parola('ragionevol(?:mente|e)\\s+perseguibil(?:e|i|ità)'),
    formulaSostitutiva:
      'Sono presenti/non presenti dati e assunzioni necessari alla valutazione della ragionevole perseguibilità del risanamento.',
    qualificazione:
      'La verifica è riservata all’imprenditore, all’esperto e ai professionisti competenti nel rispettivo ruolo.',
    sorvegliatoNeiSorgenti: false,
  },
  {
    id: 'LEX-SEGNALAZIONE-DOVUTA',
    termine: 'segnalazione dovuta',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('segnalazion[ei]\\s+(?:è\\s+|sono\\s+)?dovut[ae]'),
    formulaSostitutiva:
      'Risultano integrati/non risultano integrati i presupposti oggettivi rilevati ex [source_id], alla data [data].',
    qualificazione:
      'L’esito non attesta l’effettivo obbligo di invio né l’avvenuta trasmissione della segnalazione.',
    sorvegliatoNeiSorgenti: true,
  },
  {
    id: 'LEX-OLTRE-SOGLIA',
    termine: 'oltre soglia',
    classe: 'CONSENTITO_TECNICO',
    modello: parola('oltre\\s+(?:la\\s+)?soglia'),
    formulaSostitutiva:
      'Importo rilevato pari a [x], superiore/non superiore a [soglia] ai sensi di [source_id].',
    qualificazione: 'Riscontro quantitativo riferito ai dati disponibili alla data [data].',
    sorvegliatoNeiSorgenti: false,
  },
  {
    id: 'LEX-CRISI',
    termine: 'crisi',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('crisi'),
    formulaSostitutiva:
      'Sono rilevati segnali o squilibri da sottoporre a valutazione professionale.',
    qualificazione: 'Il rilevamento di segnali non accerta lo stato di crisi.',
    sorvegliatoNeiSorgenti: false,
    notaPiattaforma:
      'Vietato come ACCERTAMENTO («l’azienda è in crisi»). Resta nei nomi di norme e istituti (Codice della crisi, composizione negoziata della crisi), che sono citazioni.',
  },
  {
    id: 'LEX-INSOLVENZA',
    termine: 'insolvenza',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('insolvenza|insolvent[ei]'),
    formulaSostitutiva: 'Sono rilevati elementi finanziari che richiedono verifica professionale.',
    qualificazione: 'L’elaborazione non accerta lo stato di insolvenza.',
    sorvegliatoNeiSorgenti: false,
    notaPiattaforma: 'Come «crisi»: vietato come accertamento, ammesso come citazione.',
  },
  {
    id: 'LEX-PAVIMENTO-MINIMO',
    termine: 'pavimento minimo',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('paviment[oi](?:\\s+minim[oi])?'),
    formulaSostitutiva:
      'Valore di soddisfacimento nello scenario liquidatorio stimato pari a [x], secondo metodologia [id].',
    qualificazione: 'La stima non costituisce soglia legale automatica né giudizio di convenienza.',
    sorvegliatoNeiSorgenti: true,
  },
  {
    id: 'LEX-OMOLOGABILE',
    termine: 'omologabile',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('omologabil(?:e|i|ità)'),
    formulaSostitutiva:
      'Sono presenti/non presenti i dati per la verifica istruttoria delle condizioni di omologazione.',
    qualificazione: 'L’omologazione è riservata al tribunale.',
    sorvegliatoNeiSorgenti: true,
  },
  {
    id: 'LEX-CRAM-DOWN-APPLICABILE',
    termine: 'cram down fiscale/previdenziale applicabile',
    classe: 'RISERVATO_PROFESSIONISTA',
    modello: parola(
      '(?:cram\\s*-?\\s*down|omologazione\\s+forzosa)[^.;\\n]{0,40}?\\s(?:è\\s+|risulta\\s+)?applicabil[ei]'
    ),
    formulaSostitutiva:
      'Sono rilevati/non rilevati i dati necessari per esaminare i presupposti dell’art. 63/88 CCII.',
    qualificazione: 'La verifica richiede valutazione professionale e provvedimento del tribunale.',
    sorvegliatoNeiSorgenti: false,
  },
  {
    id: 'LEX-ATTESTATO',
    termine: 'attestato / asseverato',
    classe: 'VIETATO_AUTOMATICO',
    modello: parola('attestat[oaie]|asseverat[oaie]'),
    formulaSostitutiva: 'Bozza istruttoria per validazione del professionista.',
    qualificazione: null,
    sorvegliatoNeiSorgenti: false,
    notaPiattaforma:
      'Da bloccare finché non siano registrati firmatario, incarico, requisiti e approvazione. «Piano attestato» (art. 56) è il nome di un istituto.',
  },
  {
    id: 'LEX-COMPLETO',
    termine: 'completo / incompleto',
    classe: 'CONSENTITO_QUALIFICATO',
    modello: parola('(?:in)?complet[oaie]'),
    formulaSostitutiva: 'Completo/incompleto rispetto alla checklist [id] e ai documenti censiti.',
    qualificazione: 'La completezza è riferita esclusivamente al perimetro documentale dichiarato.',
    sorvegliatoNeiSorgenti: false,
  },
  {
    id: 'LEX-CONFORME',
    termine: 'conforme',
    classe: 'CONSENTITO_QUALIFICATO',
    modello: parola('conform[ei]'),
    formulaSostitutiva: 'Coerente/non coerente con la regola parametrica [id].',
    qualificazione: 'La coerenza parametrica non equivale a conformità giuridica.',
    sorvegliatoNeiSorgenti: false,
  },
];

/** Qualificazione che accompagna ogni riscontro con i parametri dell'ente. */
export const QUALIFICAZIONE_RISCONTRO_PARAMETRI =
  'Il controllo non esprime un giudizio di ricevibilità, ammissibilità o omologabilità. La coerenza parametrica non equivale a conformità giuridica.';

export interface RilievoLessico {
  voce: VoceLessico;
  trovato: string;
  posizione: number;
  /** Una trentina di caratteri prima e dopo, per capire l'uso senza aprire il testo. */
  contesto: string;
}

/**
 * Cerca i termini del lessico in un testo. Senza `classi` li cerca tutti.
 * Non decide nulla: elenca. Che cosa farne (bloccare, segnalare, sostituire)
 * lo stabilisce chi chiama, secondo la classe della voce.
 */
export function cercaTerminiLessico(
  testo: string,
  opzioni: { classi?: ClasseLessico[]; soloSorvegliati?: boolean } = {}
): RilievoLessico[] {
  const rilievi: RilievoLessico[] = [];
  for (const voce of LESSICO) {
    if (opzioni.classi && !opzioni.classi.includes(voce.classe)) continue;
    if (opzioni.soloSorvegliati && !voce.sorvegliatoNeiSorgenti) continue;
    const rx = new RegExp(voce.modello.source, voce.modello.flags);
    for (const m of testo.matchAll(rx)) {
      const posizione = m.index ?? 0;
      rilievi.push({
        voce,
        trovato: m[0],
        posizione,
        contesto: testo
          .slice(Math.max(0, posizione - 30), posizione + m[0].length + 30)
          .replace(/\s+/g, ' ')
          .trim(),
      });
    }
  }
  return rilievi.sort((a, b) => a.posizione - b.posizione);
}

// ---------------------------------------------------------------------------
// Supporto al revisore a regole (fase 4)
// ---------------------------------------------------------------------------

/**
 * Sostituzioni che si possono fare in automatico senza rompere la frase: solo
 * dove la nuova espressione ha la stessa funzione grammaticale della vecchia.
 * Per gli altri termini vietati non esiste una sostituzione sicura: il testo
 * si blocca e va rigenerato o riscritto.
 */
export const SOSTITUZIONI_DIRETTE: { modello: RegExp; con: string; voce: string }[] = [
  {
    voce: 'LEX-RICEVIBILE',
    modello: parola('non\\s+ricevibil[ei]|irricevibil[ei]'),
    con: 'non coerente con i parametri configurati',
  },
  {
    voce: 'LEX-RICEVIBILE',
    modello: parola('ricevibilità'),
    con: 'coerenza con i parametri configurati',
  },
  {
    voce: 'LEX-RICEVIBILE',
    modello: parola('ricevibil[ei]'),
    con: 'coerente con i parametri configurati',
  },
  {
    voce: 'LEX-PAVIMENTO-MINIMO',
    modello: parola('paviment[oi]\\s+minim[oi]'),
    con: 'termine di confronto',
  },
];

/**
 * Termini vietati solo quando ACCERTANO uno stato: «l'azienda è in crisi» si',
 * «Codice della crisi» no. Il modello riconosce la costruzione assertiva.
 */
export const ACCERTAMENTI_VIETATI: { voce: string; modello: RegExp }[] = [
  {
    voce: 'LEX-CRISI',
    modello: parola(
      '(?:è|e’|sono|versa|versano|si\\s+trova|si\\s+trovano|risulta|risultano|appare)\\s+(?:ormai\\s+|già\\s+|chiaramente\\s+)?in\\s+(?:uno\\s+)?(?:stato\\s+di\\s+)?crisi|stato\\s+di\\s+crisi\\s+(?:è\\s+)?(?:accertat[oa]|conclamat[oa]|evidente)|crisi\\s+conclamata'
    ),
  },
  {
    voce: 'LEX-INSOLVENZA',
    modello: parola(
      '(?:è|e’|sono|versa|versano|si\\s+trova|si\\s+trovano|risulta|risultano|appare)\\s+(?:ormai\\s+|già\\s+|chiaramente\\s+)?(?:in\\s+(?:uno\\s+)?(?:stato\\s+di\\s+)?insolvenza|insolvent[ei])|stato\\s+di\\s+insolvenza\\s+(?:è\\s+)?(?:accertat[oa]|conclamat[oa]|evidente)'
    ),
  },
  {
    voce: 'LEX-SOSTENIBILE',
    modello: parola(
      '(?:è|sono|risulta|risultano|appare|appaiono|si\\s+conferma)\\s+(?:pienamente\\s+|complessivamente\\s+|finanziariamente\\s+)?(?:in)?sostenibil[ei]'
    ),
  },
];

/**
 * Istruzioni di lessico da accodare a ogni prompt che genera un testo: meglio
 * prevenire che bloccare. Vive qui perche' nomina i termini vietati, e questo
 * file e' l'unico esente dalla sorveglianza dei sorgenti.
 */
function elencoFontiCitabili(): string {
  return FONTI.filter((f) => f.verificata && f.stato !== 'abrogato')
    .map((f) => `  - ${f.norma} — ${f.oggetto.split('.')[0]}.`)
    .join('\n');
}

export function istruzioniLessicoPerPrompt(): string {
  const vietati = LESSICO.filter((v) => v.classe === 'VIETATO_AUTOMATICO').map(
    (v) => `«${v.termine}»`
  );
  const riservati = LESSICO.filter((v) => v.classe === 'RISERVATO_PROFESSIONISTA').map(
    (v) => `«${v.termine}»`
  );
  return `

LESSICO OBBLIGATORIO (il testo viene controllato da un revisore automatico e, se lo viola, viene bloccato):
- Non usare mai, come esito o giudizio, i termini: ${vietati.join(', ')}. «Crisi» e «insolvenza» sono ammessi solo nei nomi di norme e istituti, mai per dire che l'azienda lo è.
- Non esprimere giudizi riservati al professionista o al tribunale: ${riservati.join(', ')}. Al loro posto descrivi i dati, i calcoli e ciò che manca.
- Per il confronto con i parametri dell'ente scrivi «coerente / non coerente con i parametri configurati».
- Per l'art. 25-novies scrivi «risultano integrati / non risultano integrati i presupposti oggettivi rilevati», mai che una segnalazione è dovuta o obbligatoria.
- Un indicatore, il DSCR, il Test pratico o la Check List non dimostrano né accertano nulla: sono strumenti operativi.
- Se richiami l'omologazione forzosa (cram down), indica sempre l'articolo (63 o 88 CCII), la versione applicabile alla data della proposta e che dipende dall'adesione degli altri creditori.
- Un dato assente si dichiara assente: non scrivere mai che vale zero.
- Non attribuire alla piattaforma il ruolo di chi attesta, assevera, certifica o accerta.
- Cita SOLO le norme del registro delle fonti qui sotto, con questi estremi. Non citare a memoria altri decreti, circolari o articoli: un riferimento fuori dal registro blocca il testo. Se ti serve una norma che non c'è, scrivi «[fonte da inserire nel registro]» invece dell'estremo.
${elencoFontiCitabili()}`;
}

/**
 * La qualificazione obbligatoria nomina i termini vietati per NEGARLI («non
 * esprime un giudizio di ricevibilità, ammissibilità o omologabilità»): quelle
 * occorrenze non sono violazioni. Restituisce gli intervalli da ignorare.
 */
export function intervalliQualificazioneNegata(testo: string): [number, number][] {
  const rx =
    /non\s+esprime\s+un\s+giudizio\s+di\s+ricevibilità,\s+ammissibilità\s+o\s+omologabilità/giu;
  return Array.from(testo.matchAll(rx)).map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
}
