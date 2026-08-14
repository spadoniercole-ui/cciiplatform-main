// src/lib/checklist/ministeriale.ts
//
// Contenuto della Check List (lista di controllo) prevista dall'art. 5-bis
// CCII, Sezione II del decreto dirigenziale del Ministero della Giustizia
// del 23 aprile 2026 (Bollettino Ufficiale n. 10/2026). Le domande e le
// indicazioni operative sono riformulate in forma sintetica a partire dal
// testo ufficiale, non riprodotte parola per parola: per il testo integrale
// fare sempre riferimento al Bollettino Ufficiale.
//
// PESO (Modello B, scelto dall'utente): ogni domanda ha un peso a 3 livelli
// — STRUTTURALE (3): un "No" qui mette in dubbio la tenuta stessa del piano;
// RILEVANTE (2): un "No" indebolisce il piano ma non lo invalida da solo;
// DOCUMENTALE (1): buona pratica di supporto, un "No" segnala una lacuna
// documentale più che un rischio sostanziale. L'assegnazione è una scelta di
// merito fatta in base alla logica del testo ministeriale, non un dato
// normativo esplicito: va rivista con un professionista prima di usarla per
// un giudizio verso terzi (vedi anche docs/CHECKLIST_VALIDAZIONE_NORMATIVA.md).

export type PesoDomanda = 'STRUTTURALE' | 'RILEVANTE' | 'DOCUMENTALE';

export const PESO_NUMERICO: Record<PesoDomanda, number> = {
  STRUTTURALE: 3,
  RILEVANTE: 2,
  DOCUMENTALE: 1,
};

export interface DomandaChecklist {
  id: string; // es. "1.1", "6.4" — corrisponde alla numerazione ufficiale
  aCuraDi: 'imprenditore' | 'esperto';
  peso: PesoDomanda;
  domanda: string;
  indicazioneSeNo?: string;
  /** Valori dei campi extra definiti per questo spazio (checklist_campi_extra), chiave = id del campo extra. Puramente informativo, nessun ruolo nel calcolo del punteggio. */
  extra?: Record<string, string>;
}

export interface SezioneChecklist {
  numero: string;
  titolo: string;
  domande: DomandaChecklist[];
}

export const CHECKLIST_MINISTERIALE: SezioneChecklist[] = [
  {
    numero: '1',
    titolo: "Il requisito dell'organizzazione dell'impresa",
    domande: [
      {
        id: '1.1',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          "L'impresa dispone delle risorse chiave (umane e tecniche) per la conduzione dell'attività?",
        indicazioneSeNo: 'Individuare il modo per procurarsele.',
      },
      {
        id: '1.2',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda: "L'impresa ha predisposto un monitoraggio continuativo dell'andamento aziendale?",
        indicazioneSeNo:
          "Attivare quanto meno il confronto con i dati dell'esercizio precedente (ricavi, portafoglio ordini, costi, posizione finanziaria netta).",
      },
      {
        id: '1.3',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          "L'impresa è in grado di stimare l'andamento gestionale tramite indicatori chiave (KPI) per valutazioni rapide in continuo?",
        indicazioneSeNo:
          'Individuare indicatori coerenti con il proprio modello di business e settore, e raccogliere le informazioni necessarie alla valutazione tendenziale.',
      },
      {
        id: '1.4',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda: "L'impresa dispone di un piano di tesoreria a 6 mesi?",
        indicazioneSeNo:
          'Predisporre un prospetto di stima delle entrate e uscite finanziarie almeno a 13 settimane, verificandone a consuntivo gli scostamenti.',
      },
    ],
  },
  {
    numero: '2',
    titolo: "Rilevazione della situazione contabile e dell'andamento corrente",
    domande: [
      {
        id: '2.1',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          'È disponibile una situazione contabile aggiornata (rettifiche di competenza e assestamenti di chiusura), non anteriore a 120 giorni?',
        indicazioneSeNo:
          'Redigerla come presupposto necessario per il piano; va aggiornata nel corso delle trattative se emergono scostamenti.',
      },
      {
        id: '2.2',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda: 'La situazione debitoria è completa ed affidabile?',
        indicazioneSeNo: 'Appostare adeguati fondi correttivi.',
      },
      {
        id: '2.3',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Il valore contabile dei cespiti non è superiore al maggiore tra valore recuperabile e valore di mercato?',
        indicazioneSeNo:
          'Procedere a svalutazioni per adeguare il valore dei beni alle condizioni effettive.',
      },
      {
        id: '2.4',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          "È disponibile un prospetto sull'anzianità dei crediti commerciali e sulle cause del ritardo di incasso?",
        indicazioneSeNo:
          'Suddividere i crediti per anzianità (non scaduti, 1-30, 31-60, 61-120, oltre 120 giorni); per gli scaduti oltre la fisiologia di settore, stimare i tempi di incasso con particolare prudenza.',
      },
      {
        id: '2.5',
        aCuraDi: 'imprenditore',
        peso: 'DOCUMENTALE',
        domanda:
          'È disponibile un prospetto delle rimanenze di magazzino con i tempi di movimentazione?',
        indicazioneSeNo:
          'Isolare le giacenze a lenta rotazione per stimarle correttamente e valutare gli approvvigionamenti necessari.',
      },
      {
        id: '2.6',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          "I debiti risultanti dalla contabilità sono riconciliati con il certificato dei debiti tributari, la situazione debitoria verso l'Agente della Riscossione, il certificato dei debiti contributivi/premi assicurativi e la Centrale Rischi?",
        indicazioneSeNo: 'Individuare le cause delle differenze significative.',
      },
      {
        id: '2.7',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Si è tenuto adeguatamente conto dei rischi di passività potenziali, incluse le garanzie concesse?',
        indicazioneSeNo:
          "Stimare entità e momento del pagamento delle eventuali passività potenziali, anche con l'aiuto dei professionisti dell'impresa.",
      },
      {
        id: '2.8',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          "Sono disponibili informazioni sull'andamento corrente (ricavi, portafoglio ordini, costi, flussi) confrontate con lo stesso periodo dell'esercizio precedente?",
        indicazioneSeNo:
          "Formulare previsioni sui ricavi coerenti, per quanto possibile, con l'andamento di settore.",
      },
      {
        id: '2.9',
        aCuraDi: 'esperto',
        peso: 'RILEVANTE',
        domanda:
          "L'organo di controllo e il revisore legale (se presenti) hanno osservazioni sulla situazione contabile in termini di affidabilità o adeguatezza per il piano?",
        indicazioneSeNo:
          "Se sì, l'imprenditore deve rimuovere le criticità appostando passività ulteriori o rettificando i flussi economico-finanziari attesi.",
      },
    ],
  },
  {
    numero: '3',
    titolo: 'Individuazione delle strategie di intervento atte a rimuovere le cause della crisi',
    domande: [
      {
        id: '3.1',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'È stato individuato perché è stato percepito uno stato di crisi o squilibrio, e con quali manifestazioni concrete?',
      },
      {
        id: '3.2',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda: 'Sono state individuate le cause coerenti con le manifestazioni della crisi?',
        indicazioneSeNo:
          'Predisporre il confronto storico di stato patrimoniale e conto economico su un numero adeguato di anni (indicativamente 3-5), eventualmente con interviste alle funzioni aziendali chiave.',
      },
      {
        id: '3.3',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          "Sono state individuate le strategie di intervento e le iniziative industriali che l'imprenditore intende adottare?",
        indicazioneSeNo:
          'Valutare se siano replicabili le strategie adottate con successo da imprese concorrenti.',
      },
      {
        id: '3.4',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          "L'impresa dispone delle capacità/competenze manageriali per realizzare le iniziative pianificate?",
        indicazioneSeNo:
          'Considerare solo le iniziative per cui sia realisticamente possibile reperire (anche sul mercato) le competenze necessarie.',
      },
      {
        id: '3.5',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Sono stati definiti tempi, effetti (ricavi/costi/investimenti) e responsabili delle iniziative da adottare?',
      },
      {
        id: '3.6',
        aCuraDi: 'imprenditore',
        peso: 'DOCUMENTALE',
        domanda:
          'Sono state individuate iniziative alternative in caso di scostamento tra obiettivi pianificati e raggiunti?',
        indicazioneSeNo:
          'Individuare i punti di rottura dei KPI di cui al punto 1.3 al cui raggiungimento attivare le iniziative alternative.',
      },
      {
        id: '3.7',
        aCuraDi: 'esperto',
        peso: 'DOCUMENTALE',
        domanda:
          'Il piano è coerente con eventuali piani redatti in precedenza, e le differenze sono giustificate?',
      },
      {
        id: '3.8',
        aCuraDi: 'esperto',
        peso: 'STRUTTURALE',
        domanda:
          'Il piano appare credibile, fondato su intenzioni strategiche chiare e coerenti con la situazione di fatto?',
        indicazioneSeNo: 'Individuare le strategie che sarebbero invece da adottare.',
      },
    ],
  },
  {
    numero: '4',
    titolo: 'Le proiezioni dei flussi finanziari',
    domande: [
      {
        id: '4.2',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Le proiezioni coprono un periodo massimo di 5 anni, salvo un arco superiore giustificato da circostanze specifiche?',
      },
      {
        id: '4.3',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          'Le proiezioni dei ricavi sono coerenti con i dati storici e correnti, e le variazioni sono giustificate e confrontate con le prospettive di settore?',
      },
      {
        id: '4.4',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          'La stima dei costi variabili e di struttura è coerente con la situazione in atto e i dati storici, con risparmi giustificati e rischi mitigati?',
      },
      {
        id: '4.6',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Il piano tiene conto adeguatamente degli investimenti di mantenimento occorrenti (inclusa sicurezza sul lavoro e ambiente)?',
      },
      {
        id: '4.7',
        aCuraDi: 'esperto',
        peso: 'RILEVANTE',
        domanda:
          'La stima degli effetti delle iniziative industriali è coerente con le informazioni disponibili e giustificata dalle funzioni aziendali?',
      },
      {
        id: '4.8',
        aCuraDi: 'esperto',
        peso: 'STRUTTURALE',
        domanda:
          "È stata svolta una verifica di ragionevolezza della redditività prospettica rispetto all'andamento storico e ai benchmark di mercato?",
      },
      {
        id: '4.9',
        aCuraDi: 'imprenditore',
        peso: 'DOCUMENTALE',
        domanda:
          'In caso di dismissione di cespiti, le stime di realizzo (importo e tempi) sono adeguatamente motivate?',
      },
      {
        id: '4.10',
        aCuraDi: 'imprenditore',
        peso: 'DOCUMENTALE',
        domanda:
          'Nella stima delle imposte si è tenuto conto delle perdite fiscali a nuovo e del periodo di imputazione fiscale?',
      },
      {
        id: '4.13',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'La durata del piano è coerente con il tempo necessario al riequilibrio, e in caso di debito residuo oltre il piano questo è di entità sostenibile con i flussi correnti?',
      },
    ],
  },
  {
    numero: '5',
    titolo: 'Il risanamento del debito',
    domande: [
      {
        id: '5.1',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          "L'impresa sarà in grado di generare in futuro risorse sufficienti al servizio del debito?",
      },
      {
        id: '5.2',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Il piano tiene conto di fattori di rischio e incertezza anche tramite stress test coerenti con le prospettive di mercato?',
      },
      {
        id: '5.3',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          'È stato quantificato il debito da servire nei singoli anni del piano (scaduto, riscadenziato, in moratoria, linee non rinnovate, rate in scadenza)?',
      },
      {
        id: '5.4',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          'Sono state definite le proposte alle parti interessate per fronteggiare il debito (dilazione, stralcio, conversione in equity, nuova finanza)?',
      },
      {
        id: '5.5',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Le proposte consentono, in prospettiva, il rispetto dei requisiti minimi di capitale sociale?',
      },
    ],
  },
  {
    numero: '6',
    titolo: 'Valore di liquidazione del patrimonio',
    domande: [
      {
        id: '6.1',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          "È stato stimato il valore di liquidazione del patrimonio, per individuare l'interesse dei creditori?",
      },
      {
        id: '6.2',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          'È stato usato il criterio corretto: valore di liquidazione giudiziale in caso di crisi/insolvenza, valore di liquidazione ordinata in bonis in caso di solo squilibrio ex art. 12 CCII?',
      },
      {
        id: '6.3',
        aCuraDi: 'imprenditore',
        peso: 'STRUTTURALE',
        domanda:
          "La stima è fondata su parametri oggettivi, incluso l'eventuale maggior valore da cessione dell'azienda in esercizio?",
      },
      {
        id: '6.4',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Si è tenuto conto del fattore tempo (attualizzazione) e della probabilità di una cessione unitaria in sede di liquidazione giudiziale?',
      },
      {
        id: '6.5',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Il valore di liquidazione è calcolato alla data attuale (in caso di composizione negoziata)?',
      },
      {
        id: '6.7',
        aCuraDi: 'imprenditore',
        peso: 'DOCUMENTALE',
        domanda:
          "In caso di interruzione dell'attività, si è tenuto conto di penali contrattuali, mancato preavviso a clienti/fornitori/dipendenti e obblighi risarcitori?",
      },
      {
        id: '6.8',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'La valutazione degli immobili adotta la configurazione concorsuale (non quella di mercato ordinario), salvo il caso di composizione negoziata su impresa in bonis?',
      },
      {
        id: '6.10',
        aCuraDi: 'imprenditore',
        peso: 'DOCUMENTALE',
        domanda:
          "Il valore del magazzino distingue correttamente tra scenario di prosecuzione e di interruzione dell'attività?",
      },
    ],
  },
  {
    numero: '7',
    titolo: 'In caso di gruppi di imprese',
    domande: [
      {
        id: '7.2',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'È stata redatta una relazione sulla struttura del gruppo, sui vincoli partecipativi/contrattuali e sul bilancio consolidato (se redatto)?',
      },
      {
        id: '7.3',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Il piano dà evidenza dei rapporti economici, finanziari e patrimoniali tra le società del gruppo?',
      },
      {
        id: '7.4',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          'Sono state individuate le altre imprese del gruppo in difficoltà e le modalità per affrontarle?',
      },
      {
        id: '7.6',
        aCuraDi: 'esperto',
        peso: 'STRUTTURALE',
        domanda:
          'Le operazioni infragruppo previste dal piano possono arrecare pregiudizio ai creditori di altre imprese del gruppo?',
      },
      {
        id: '7.7',
        aCuraDi: 'imprenditore',
        peso: 'RILEVANTE',
        domanda:
          "È stato valutato come l'appartenenza al gruppo influenzi il valore di liquidazione delle singole entità?",
      },
    ],
  },
];

/** Sotto-sezione "imprese minori" (punto 8): formula semplificata, riferimento diretto anche dal Test Pratico. */
export const CHECKLIST_IMPRESE_MINORI_NOTA =
  "Le imprese minori possono limitarsi a calcolare debito scaduto + rate in scadenza nel primo anno − giacenza di cassa, confrontati con il risultato di gestione dell'anno precedente rettificato di ammortamenti e componenti straordinarie (stessa logica semplificata del Test Pratico, punto 8 della Sezione II).";
