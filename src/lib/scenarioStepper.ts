// src/lib/scenarioStepper.ts
//
// Due percorsi separati, non più un unico elenco filtrato con
// soloRicevuta: Ricevente e Redigente hanno compiti speculari ma
// diversi. Posizione Ente, Import XBRL e Check List sono spariti dal
// percorso Ricevente — vivono ad Azienda (Screening ne fa già le
// veci, su dati certi da CCIAA e sistemi dell'ente), non si
// ripetono per ogni scenario.

import {
  FileText,
  FileSpreadsheet,
  ClipboardEdit,
  TrendingUp,
  ListChecks,
  BarChart3,
  FlaskConical,
  NotebookText,
  Sparkles,
} from 'lucide-react';

export interface PassoScenario {
  numero: number;
  id: string;
  label: string;
  descrizione: string;
  /** null = nessun permesso dedicato ancora (passi non costruiti, o Relazione AI col suo modulo). */
  modulo: string | null;
  stato: 'pronta' | 'presto';
  icon: typeof FileText;
}

export const PASSI_SCENARIO_RICEVUTA: PassoScenario[] = [
  {
    numero: 0,
    id: 'proposta',
    label: 'Proposta',
    descrizione:
      'Cosa l\u2019azienda offre, riga per riga, più i tre documenti della fase di analisi (proposta di cram down, asseverazione, piano di sviluppo). Solo la proposta di cram down è obbligatoria; l\u2019assenza degli altri due penalizza il giudizio finale, non lo blocca. Il quadro qui raccolto (righe + documenti + Screening dell\u2019azienda) alimenta il giudizio complessivo, non un semplice ricevibile/non ricevibile.',
    modulo: 'report',
    stato: 'pronta',
    icon: FileText,
  },
  {
    numero: 1,
    id: 'posizione-aggiornata',
    label: 'Posizione Aggiornata',
    descrizione:
      'I dati più recenti dell\u2019azienda, aggiornati rispetto all\u2019ultimo bilancio depositato — più caricamenti nel tempo sono ammessi (es. un bilancino al 31/12 e un altro al 31/03), ciascuno con la propria data: la piattaforma annualizza da sola, non confonde un trimestre con un anno intero.',
    modulo: null,
    stato: 'pronta',
    icon: ClipboardEdit,
  },
  {
    numero: 2,
    id: 'indici',
    label: 'Indici',
    descrizione:
      'Ricalcolati automaticamente ogni volta che arriva un nuovo caricamento in Posizione Aggiornata — anno corrente, anno precedente e ultima posizione aggiornata messi a confronto, senza bisogno di rilanciare nulla a mano.',
    modulo: 'indici',
    stato: 'pronta',
    icon: TrendingUp,
  },
  {
    numero: 3,
    id: 'settore',
    label: 'Dati di Settore',
    descrizione:
      'La crescita dell\u2019azienda confrontata con quella del suo settore (dati ISTAT, per codice ATECO) — aggiornati in automatico appena la Proposta è caricata, nessun passo manuale da avviare.',
    modulo: null,
    stato: 'pronta',
    icon: BarChart3,
  },
  {
    numero: 4,
    id: 'brogliaccio',
    label: 'Brogliaccio',
    descrizione:
      'Raccoglie insieme lo Screening dell\u2019azienda, la verifica della proposta e dei documenti a corredo, e i dati attualizzati — un\u2019ultima occasione per correggere incongruenze prima della Relazione finale.',
    modulo: null,
    stato: 'pronta',
    icon: NotebookText,
  },
  {
    numero: 5,
    id: 'relazione',
    label: 'Relazione',
    descrizione:
      'Il documento finale, impaginato su carta intestata, in PDF. Una volta generato, lo scenario si blocca in sola lettura alla data di quella relazione — per una nuova valutazione serve aprire un altro scenario, non riaprire questo.',
    modulo: 'relazione',
    stato: 'pronta',
    icon: Sparkles,
  },
];

export const PASSI_SCENARIO_DA_DEFINIRE: PassoScenario[] = [
  {
    numero: 0,
    id: 'xbrl',
    label: 'Import XBRL',
    descrizione:
      'I bilanci depositati dall\u2019azienda, quelli veri — non un\u2019autodichiarazione. Da qui la piattaforma ricava ricavi, costi, indici e la situazione debitoria storica, la base numerica su cui si costruisce tutto il resto del giudizio.',
    modulo: 'xbrl',
    stato: 'pronta',
    icon: FileSpreadsheet,
  },
  {
    numero: 1,
    id: 'posizione-aggiornata',
    label: 'Posizione Aggiornata',
    descrizione:
      'Un bilancino di verifica più recente dell\u2019ultimo bilancio depositato — utile perché tra il deposito e oggi possono essere passati mesi. Se copre meno di un anno intero, indicare la data: la piattaforma annualizza da sola, non confronta un trimestre con un anno come se fossero la stessa cosa.',
    modulo: null,
    stato: 'pronta',
    icon: ClipboardEdit,
  },
  {
    numero: 2,
    id: 'indici',
    label: 'Indici',
    descrizione:
      'Anno corrente, anno precedente e posizione aggiornata messi a confronto — la fotografia della salute dell\u2019azienda in un solo colpo d\u2019occhio, senza dover saltare tra le altre pagine per ricostruirla a mano.',
    modulo: 'indici',
    stato: 'pronta',
    icon: TrendingUp,
  },
  {
    numero: 3,
    id: 'checklist',
    label: 'Check List',
    descrizione:
      'Le domande qualitative della Sezione II del decreto ministeriale — quello che un bilancio da solo non racconta. Ogni risposta pesa sul punteggio finale secondo il peso configurato (Strutturale/Rilevante/Documentale), non tutte le domande contano allo stesso modo.',
    modulo: 'checklist',
    stato: 'pronta',
    icon: ListChecks,
  },
  {
    numero: 4,
    id: 'settore',
    label: 'Dati di Settore',
    descrizione:
      'La crescita dell\u2019azienda confrontata con quella del suo settore (dati ISTAT, per codice ATECO) — un\u2019azienda che cresce del 3% sembra andare bene, finché non si scopre che il settore intero cresce del 10%.',
    modulo: null,
    stato: 'pronta',
    icon: BarChart3,
  },
  {
    numero: 5,
    id: 'simulazione',
    label: 'Simulazione',
    descrizione:
      'Leve da muovere (personale, giorni di incasso/pagamento, imposte) finché gli indici non tornano in equilibrio — uno strumento di scrittura, non di lettura.',
    modulo: null,
    stato: 'pronta',
    icon: FlaskConical,
  },
  {
    numero: 6,
    id: 'brogliaccio',
    label: 'Brogliaccio',
    descrizione:
      'Il documento che accumula tutto quanto raccolto fin qui, un livello alla volta — il punto di partenza per la proposta e la relazione finale, non un modulo a sé da compilare separatamente.',
    modulo: null,
    stato: 'pronta',
    icon: NotebookText,
  },
  {
    numero: 7,
    id: 'proposta',
    label: 'Proposta',
    descrizione:
      'Il penultimo passo, non il primo — qui si scrive cosa l\u2019azienda offre, riga per riga, avendo già in mano tutto il resto (bilanci, indici, check list, simulazione, brogliaccio): la proposta nasce da quel quadro, non lo precede. Insieme alla proposta si redigono i documenti di corredo (asseverazione del professionista, eventuale lettera di convocazione, eventuale memoria legale).',
    modulo: 'report',
    stato: 'pronta',
    icon: FileText,
  },
  {
    numero: 8,
    id: 'relazione',
    label: 'Relazione AI',
    descrizione:
      'L\u2019ultimo passo — una bozza scritta dall\u2019assistente sulla base di tutto quello raccolto negli altri passi, non un giudizio proprio: si sblocca solo dopo aver avviato almeno Proposta, Check List e XBRL, perché prima non avrebbe nulla di reale su cui basarsi.',
    modulo: 'relazione',
    stato: 'pronta',
    icon: Sparkles,
  },
];

export function passiScenario(tipoProposta: 'RICEVUTA' | 'DA_DEFINIRE'): PassoScenario[] {
  return tipoProposta === 'RICEVUTA' ? PASSI_SCENARIO_RICEVUTA : PASSI_SCENARIO_DA_DEFINIRE;
}
