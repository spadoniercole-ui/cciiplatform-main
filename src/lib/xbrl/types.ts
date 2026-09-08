// src/lib/xbrl/types.ts
//
// Tipi condivisi dall'UNICA pipeline di analisi XBRL della piattaforma.
// Se serve un nuovo campo, si aggiunge qui: non creare tipi paralleli altrove.

export type Periodo = 'corrente' | 'precedente';

/** Anagrafica estratta dall'header del file XBRL (contesto entity + dati anagrafici). */
export interface AnagraficaXbrl {
  ragioneSociale: string;
  codiceFiscale: string;
  indirizzo: string;
  codiceAteco: string;
  /** true se uno o più campi anagrafici non sono stati trovati nel file */
  anagraficaIncompleta: boolean;
}

/** Valori economico-patrimoniali canonici, per un singolo periodo (N o N-1). */
export interface DatiFinanziariPeriodo {
  ricaviVendite: number;
  valoreProduzione: number;
  costiProduzione: number;
  ebit: number; // differenza valore/costi produzione
  ammortamenti: number;
  ebitda: number;
  oneriFinanziari: number;
  utileEsercizio: number;

  totaleAttivo: number;
  attivoCircolante: number;
  disponibilitaLiquide: number;
  immobilizzazioni: number;

  patrimonioNetto: number;
  totaleDebiti: number;
  debitiBanche: number;
  debitiFornitori: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  passivoCorrente: number;
  /** Attivo — usato per i giorni medi di incasso nella Simulazione Redigente, non calcolato dagli indici CNDCEC esistenti. */
  creditiClienti: number;
}

/** Un fact XBRL non riconosciuto da nessun alias noto: serve per la UI di parificazione manuale. */
export interface FactNonMappato {
  tagGrezzo: string;
  tagPulito: string;
  contextRef: string;
  valore: number;
}

/** Ogni fact numerico del file, con periodo e mapping risolti (o null se non trovati). Usato dalla UI di parificazione tag. */
export interface FactRisolto {
  tagPulito: string;
  tagOriginale: string;
  contextRef: string;
  periodo: Periodo | null;
  valore: number;
  chiaveMappata: string | null;
}

export interface IndiceCcii {
  codice: string;
  nome: string;
  valore: number | 'N/D';
  soglia: string;
  esito: 'OK' | 'VIOLATO' | 'NON_CALCOLABILE';
  note?: string;
}

export type AlertSeverity = 'GREEN' | 'YELLOW' | 'RED';

/** Scomposizione del debito e posizione finanziaria netta, per la tab "Situazione Debitoria". */
export interface SituazioneDebitoria {
  debitiBanche: number;
  debitiFornitori: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  altriDebiti: number;
  totaleDebiti: number;
  disponibilitaLiquide: number;
  /** PFN = Debiti verso banche - Disponibilità liquide (convenzione standard: solo debito oneroso). */
  pfn: number;
}

export interface AnalisiXbrlResult {
  meta: {
    nomeFile: string;
    /** true se il mapping dei tag ha usato il fallback statico invece della tabella su DB */
    usatoFallbackMapping: boolean;
    numeroFactTotali: number;
    numeroFactNonMappati: number;
  };
  anagrafica: AnagraficaXbrl;
  /** Anno solare del bilancio analizzato (periodo corrente), se determinabile dai contesti XBRL. */
  annoBilancio: number | null;
  corrente: DatiFinanziariPeriodo;
  precedente: DatiFinanziariPeriodo;
  indici: IndiceCcii[];
  /** Indici supplementari (ROE, ROI, rotazione attivo, ecc.) oltre ai 5 CCII principali. */
  altriIndici: IndiceCcii[];
  severity: AlertSeverity;
  situazioneDebitoria: SituazioneDebitoria;
  /** true se nel file sono stati trovati dati di conto economico (ricavi/costi di produzione). */
  hasContoEconomico: boolean;
  factNonMappati: FactNonMappato[];
  /** Tutti i fact numerici del file, risolti (periodo + mapping). Usato dalla UI di parificazione tag. */
  tuttiIFact: FactRisolto[];
  warnings: string[];
}
