// src/lib/ponte/types.ts
//
// PIANO-PONTE — contratto dati.
//
// Il Ponte non è un piano di sviluppo e non vive dentro uno Scenario: porta
// l'ultimo bilancio depositato alla Data verifica, a livello azienda. Questi
// tipi sono l'unico contratto fra motore, azioni, database e scheda: se un
// campo non è qui, non esiste nel Ponte.

import type { DatiFinanziariPeriodo, FactTestuale } from '@/lib/xbrl/types';
import type { FattiVisura } from '@/lib/visura/fatti';
import type { EsitoScenari, ParametriScenari, RangoCredito } from '@/lib/triage/scenari';

export type StatoPonte = 'BOZZA' | 'CALCOLATO' | 'CONFERMATO' | 'SUPERATO' | 'ARCHIVIATO';

export type FonteAssunzione = 'certa' | 'derivata' | 'stimata' | 'azienda' | 'settore' | 'giudice';

export type UnitaAssunzione = '%' | 'giorni' | 'EUR';

export type FonteSettore = 'settore' | 'azienda' | 'nessuna';

export interface EsercizioPonte {
  anno: number;
  dati: DatiFinanziariPeriodo;
  /** Impronta del file XBRL da cui vengono i dati e le note. */
  noteImpronta?: string | null;
}

export interface DebitoEntePonte {
  /** Contabilizzato + da contabilizzare: il debito certo che il Ponte usa. */
  totale: number;
  contributi: number;
  sanzioni: number;
  creditiAgente: number;
  /** Posizioni che formano il totale. */
  righe: number;
  /**
   * Il dettaglio dei tre stati. Presente nei Ponte calcolati da 0.178.0;
   * assente nelle versioni salvate prima, che restano leggibili.
   */
  contabilizzato?: number;
  daContabilizzare?: number;
  /** Posizioni segnalate alle unità operative, fuori dal totale. */
  segnalato?: number;
  righeSegnalate?: number;
  /** Da dove viene lo snapshot: per ora la certificazione dei debiti. */
  fonte: string;
}

export interface SettorePonte {
  /** Tasso annuo in %, già limitato nel motore. */
  tasso: number;
  fonte: FonteSettore;
  descrizione: string;
}

export interface AssunzionePonte {
  codice:
    | 'crescitaRicavi'
    | 'margineEbitda'
    | 'giorniIncasso'
    | 'giorniPagamento'
    | 'investimentiMantenimento'
    | 'aliquotaImposte'
    | 'costoDebito'
    | 'debitoEnte';
  etichetta: string;
  valore: number;
  unita: UnitaAssunzione;
  fonte: FonteAssunzione;
  motivazione: string;
  /** Intervallo ammesso; null quando la fonte è un dato certo (es. debito ente). */
  intervallo: [number, number] | null;
}

export interface InputPonte {
  aziendaId: number;
  dataRiferimento: string; // AAAA-MM-GG
  esercizi: EsercizioPonte[];
  debitoEnte: DebitoEntePonte | null;
  /** L'operatore ha dichiarato espressamente che il debito ente è zero. */
  debitoEnteDichiaratoZero: boolean;
  note: FactTestuale[];
  visura: FattiVisura | null;
  visuraImpronta: string | null;
  settore: SettorePonte;
  /**
   * Parametri documentati dell'ente per le due ipotesi di recupero. Se mancano,
   * la Sintesi integrata dichiara il recupero non calcolabile.
   */
  parametriScenari?: ParametriScenari | null;
  /** Il rango del credito dell'ente per questa azienda, scelto nel triage. */
  rangoCredito?: RangoCredito | null;
  /** Assunzioni proposte dall'AI o riviste dall'operatore; il motore le valida. */
  assunzioni?: AssunzionePonte[];
  parametri?: {
    orizzonteMassimoMesi?: number;
  };
}

export interface MesePonte {
  mese: string; // AAAA-MM
  anno: number;
  meseNumero: number;
  /** Frazione del mese coperta: 1 per i mesi pieni, meno per il mese della Data verifica. */
  frazione: number;
  ricaviVendite: number;
  altriRicavi: number;
  valoreProduzione: number;
  costiOperativi: number;
  ammortamenti: number;
  ebitda: number;
  ebit: number;
  oneriFinanziari: number;
  imposte: number;
  utile: number;
  creditiClienti: number;
  debitiFornitori: number;
  debitiBanche: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  altriDebiti: number;
  rettificaDebitoEnte: number;
  totaleDebiti: number;
  disponibilitaLiquide: number;
  immobilizzazioni: number;
  patrimonioNetto: number;
  totaleAttivo: number;
  flussoCassa: number;
  fabbisognoSenzaFinanziamento: number;
}

export interface AnnoPonte {
  anno: number;
  mesi: number;
  ricaviVendite: number;
  altriRicavi: number;
  valoreProduzione: number;
  costiOperativi: number;
  ammortamenti: number;
  ebitda: number;
  ebit: number;
  oneriFinanziari: number;
  imposte: number;
  utile: number;
  flussoCassa: number;
  creditiClienti: number;
  debitiFornitori: number;
  debitiBanche: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  altriDebiti: number;
  rettificaDebitoEnte: number;
  totaleDebiti: number;
  disponibilitaLiquide: number;
  immobilizzazioni: number;
  patrimonioNetto: number;
  totaleAttivo: number;
}

export interface ProiezionePonte {
  mesi: MesePonte[];
  anni: AnnoPonte[];
  cassaMinima: number;
  cassaFinale: number;
  debitoFinale: number;
  utileTotale: number;
  fabbisognoSenzaFinanziamento: number;
}

export interface RiconciliazionePonte {
  patrimonioNettoBilancio: number;
  utilePonte: number;
  patrimonioNettoPonte: number;
  debitoTotaleBilancio: number;
  debitoEnteCerto: number | null;
  debitoEnteNelBilancio: number | null;
  rettificaDebitoEnte: number;
  debitoTotalePonte: number;
  cassaBilancio: number;
  cassaPonte: number;
  fabbisognoSenzaFinanziamento: number;
  voci: { codice: string; etichetta: string; importo: number }[];
}

export interface ComponenteCopertura {
  codice: 'XBRL' | 'DEBITO_ENTE' | 'NOTE' | 'VISURA' | 'SETTORE';
  etichetta: string;
  peso: number;
  valore: number;
  determinato: boolean;
  dettaglio: string;
}

export interface CoperturaPonte {
  punteggio: number;
  livello: 'ALTA' | 'MEDIA' | 'BASSA';
  componenti: ComponenteCopertura[];
}

export interface AvvisoPonte {
  codice: string;
  testo: string;
}

export interface SintesiIntegrataPonte {
  /** Credito certo dell'ente; null quando non c'è né certificazione né dichiarazione di zero. */
  creditoEnte: number | null;
  debitoTotaleStimato: number;
  cassaFinale: number;
  /** Incidenza del credito sul debito totale stimato; null se il debito è zero. */
  incidenzaCreditoPct: number | null;
  rango: RangoCredito | null;
  rangoEtichetta: string | null;
  /**
   * Le due ipotesi documentate sul credito dell'ente; null quando l'ente non ha
   * configurato i propri parametri. Il Ponte non usa percentuali di nessuno.
   */
  recupero: EsitoScenari | null;
  /** Ciò che manca perché il confronto sia completo, in chiaro. */
  mancanti: string[];
  avvisi: string[];
}

export interface EsitoPonte extends ProiezionePonte {
  versioneMotore: string;
  dataRiferimento: string;
  esercizioPartenza: number;
  assunzioni: AssunzionePonte[];
  riconciliazione: RiconciliazionePonte;
  scenari: {
    favorevole: ProiezionePonte;
    sfavorevole: ProiezionePonte;
  };
  copertura: CoperturaPonte;
  /** Assente nelle versioni calcolate prima della Sintesi integrata. */
  sintesiIntegrata?: SintesiIntegrataPonte | null;
  avvisi: AvvisoPonte[];
  limiti: string[];
  sintesi: string;
}

export interface PonteSalvato {
  id: number;
  aziendaId: number;
  dataRiferimento: string;
  versione: number;
  stato: StatoPonte;
  hashInput: string;
  hashOutput: string | null;
  output: EsitoPonte | null;
  assunzioni: AssunzionePonte[];
  copertura: CoperturaPonte | null;
  avvisi: AvvisoPonte[];
  limiti: string[];
  motoreVersione: string;
  noteCopertura: number | null;
  createdAt: string;
  confermatoIl: string | null;
}

export interface PonteSintesi {
  id: number;
  versione: number;
  stato: StatoPonte;
  dataRiferimento: string;
  createdAt: string;
  confermatoIl: string | null;
}

export interface AziendaPonte {
  id: number;
  ragioneSociale: string;
  codiceAteco: string | null;
  dataVerifica: string | null;
  verificaEsito: string | null;
}

export interface DatiPonte {
  azienda: AziendaPonte;
  esercizi: EsercizioPonte[];
  note: FactTestuale[];
  visura: FattiVisura | null;
  visuraImpronta: string | null;
  /**
   * La visura trattenuta dal triage: il file c'è ma i fatti camerali non sono
   * ancora stati letti. Si dichiara, così «assente» non è una mezza verità.
   */
  visuraTrattenuta: { nome: string; caricataIl: string | null } | null;
  settore: SettorePonte;
  parametriScenari: ParametriScenari | null;
  rangoCredito: RangoCredito | null;
  debitoEnte: DebitoEntePonte | null;
  ponte: PonteSalvato | null;
  storico: PonteSintesi[];
  /** Prerequisiti che mancano: il Ponte non parte finché non sono risolti. */
  blocchi: AvvisoPonte[];
}
