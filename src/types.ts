export type AtecoCategory =
  | 'AGRICOLTURA'
  | 'MANIFATTURA'
  | 'COSTRUZIONI_EDIFICI'
  | 'COSTRUZIONI_SPECIALIZZATE'
  | 'COMMERCIO_INGROSSO'
  | 'COMMERCIO_DETTAGLIO_RISTORAZIONE'
  | 'TRASPORTI_HOTEL'
  | 'SERVIZI_IMPRESE'
  | 'SERVIZI_PERSONE';

export interface XbrlFinancialData {
  // Dati Anagrafici / Stato
  anniOperativita: number;
  inLiquidazione: boolean;
  isStartupInnovativa: boolean;

  // Patrimonio Netto (Passivo A e rettifiche)
  patrimonioNetto: number; // Passivo A
  creditiSociNonVersati: number; // Attivo A
  dividendiDeliberatiNonContabilizzati: number;

  // Conto Economico
  ricaviVendite: number; // CE A.1
  variazioneLavoriCorso: number; // CE A.3
  oneriFinanziari: number; // CE C.17

  // Stato Patrimoniale - Attivo
  totaleAttivo: number;
  attivoCircolanteBreve: number; // Attivo C (esigibile entro 12m)
  rateiRiscontiAttivi: number; // Attivo D

  // Stato Patrimoniale - Passivo
  totaleDebiti: number; // Passivo D
  debitiBreve: number; // Passivo D (esigibili entro 12m)
  debitiTributari: number; // Passivo D.12 (totali)
  debitiPrevidenziali: number; // Passivo D.13 (totali)
  rateiRiscontiPassivi: number; // Passivo E

  // Dati Cash Flow / Conto Economico per approssimazione Flusso di Cassa
  utileEsercizio: number;
  ammortamentiSvalutazioniAccantonamenti: number;
}

export interface SectorThresholds {
  oneriFinanziariSuRicaviMax: number;
  patrimonioNettoSuDebitiMin: number;
  liquiditaBreveMin: number;
  cashFlowSuAttivoMin: number;
  indebitamentoPrevTribSuAttivoMax: number;
}

export interface EvaluationResult {
  statoAllerta: boolean;
  motivo: string;
  dettaglioIndici?: {
    patrimonioNettoRettificato: number;
    oneriFinanziariSuRicavi: number;
    patrimonioNettoSuDebiti: number;
    liquiditaBreve: number;
    cashFlowSuAttivo: number;
    indebitamentoPrevTribSuAttivo: number;
  };
  violazioniSoglia?: Record<string, boolean>;
}
