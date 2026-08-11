// src/lib/Constants.ts

// Manteniamo come Record per Object.entries
export const DIZIONARIO_ANAGRAFICA: Record<string, string[]> = {
  RAGIONE_SOCIALE: ['Ragione Sociale', 'Denominazione Sociale'],
  UNITA_OPERATIVA: ['Unità Operativa', 'Sede Operativa'],
  CODICE_FISCALE: ['Codice Fiscale', 'C.F.'],
  PARTITA_IVA: ['Partita IVA', 'P.IVA'],
  CITTA: ['Città', 'Comune'],
  INDIRIZZO: ['Indirizzo', 'Via', 'Piazza'],
  CAP: ['CAP', 'Codice Avviamento Postale'],
  PROVINCIA: ['Provincia', 'Prov.'],
  PEC: ['PEC', 'Email Certificata'],
};

// Trasformiamo in Array di oggetti per usare .map()
export const DIZIONARIO_INDICI_MASTER = [
  { chiave: 'MAX_SPAZI', radici: ['Max Spazi', 'Numero Spazi'] },
  { chiave: 'MAX_AZIENDE', radici: ['Max Aziende', 'Limite Aziende'] },
  { chiave: 'MAX_UTENTI', radici: ['Max Utenti', 'Limite Utenti'] },
];

export const XBRL_TAGS = {
  RICAVI: 'itcc-ci:ValoreProduzioneRicaviVenditePrestazioni',
  VAR_RIMANENZE: 'itcc-ci:ValoreProduzioneVariazioniRimanenzeProdottiInCorsoLavorazione',
  ALTRI_RICAVI: 'itcc-ci:ValoreProduzioneAltriRicaviProventi',
  COSTI_MATERIE: 'itcc-ci:CostiProduzionePerMateriePrimeSussidiarieConsumo',
  COSTI_SERVIZI: 'itcc-ci:CostiProduzionePerServizi',
  COSTI_GODIMENTO_TERZI: 'itcc-ci:CostiProduzionePerGodimentoBeniTerzi',
  COSTI_PERSONALE: 'itcc-ci:CostiProduzionePerSalariStipendi',
  AMMORTAMENTI: 'itcc-ci:CostiProduzioneAmmortamentiSvalutazioniTotaleAmmortamentiSvalutazioni',
  ACCANTONAMENTI: 'itcc-ci:CostiProduzioneOneriDiversiGestioneOneriDiversiGestione',
  UTILE_NETTO: 'itcc-ci:PatrimonioNettoUtilePerditaEsercizio',
  PATRIMONIO_NETTO: 'itcc-ci:TotalePatrimonioNetto',
  RISULTATO_OPERATIVO: 'itcc-ci:DifferenzaValoreCostiProduzione',
  TOTALE_ATTIVO: 'itcc-ci:TotaleAttivo',
  TOTALE_PASSIVO: 'itcc-ci:TotalePassivo',
  ATTIVO_CIRCOLANTE: 'itcc-ci:TotaleAttivoCircolante',
  PASSIVO_CORRENTE: 'itcc-ci:DebitiEsigibiliEntroEsercizioSuccessivo',
  IMMOBILIZZAZIONI_NETTE: 'itcc-ci:TotaleImmobilizzazioni',
  TOTALE_DEBITI: 'itcc-ci:TotaleDebiti',
  RIMANENZE: 'itcc-ci:TotaleRimanenze',
  PASSIVITA_CONSOLIDATE: 'itcc-ci:DebitiEsigibiliOltreEsercizioSuccessivo',
} as const;

// Configurazione Master della Matrice di Parificazione (Senza stati finti)
export const MATRICE_ALLINEAMENTO_MASTER = [
  {
    id: 'R1',
    macroCategoria: 'REDDITIVITÀ',
    indiceTarget: 'ROE',
    parametroLogico: 'Utile Netto',
    tagDizionarioMaster: 'itcc-ci:PatrimonioNettoUtilePerditaEsercizio',
  },
  {
    id: 'R2',
    macroCategoria: 'REDDITIVITÀ',
    indiceTarget: 'ROE',
    parametroLogico: 'Patrimonio Netto',
    tagDizionarioMaster: 'itcc-ci:TotalePatrimonioNetto',
  },
  {
    id: 'R3',
    macroCategoria: 'REDDITIVITÀ',
    indiceTarget: 'ROI / ROS',
    parametroLogico: 'Risultato Operativo (EBIT)',
    tagDizionarioMaster: 'itcc-ci:DifferenzaValoreCostiProduzione',
  },
  {
    id: 'R4',
    macroCategoria: 'REDDITIVITÀ',
    indiceTarget: 'ROI / ROA',
    parametroLogico: 'Totale Attivo',
    tagDizionarioMaster: 'itcc-ci:TotaleAttivo',
  },
  {
    id: 'R5',
    macroCategoria: 'REDDITIVITÀ',
    indiceTarget: 'ROS / EBITDA %',
    parametroLogico: 'Ricavi delle Vendite',
    tagDizionarioMaster: 'itcc-ci:ValoreProduzioneRicaviVenditePrestazioni',
  },

  {
    id: 'L1',
    macroCategoria: 'LIQUIDITÀ',
    indiceTarget: 'Current / Quick Ratio',
    parametroLogico: 'Attivo Corrente',
    tagDizionarioMaster: 'itcc-ci:TotaleAttivoCircolante',
  },
  {
    id: 'L2',
    macroCategoria: 'LIQUIDITÀ',
    indiceTarget: 'Current / Quick Ratio',
    parametroLogico: 'Passivo Corrente',
    tagDizionarioMaster: 'itcc-ci:DebitiEsigibiliEntroEsercizioSuccessivo',
  },
  {
    id: 'L3',
    macroCategoria: 'LIQUIDITÀ',
    indiceTarget: 'Quick Ratio',
    parametroLogico: 'Rimanenze',
    tagDizionarioMaster: 'itcc-ci:TotaleRimanenze',
  },

  {
    id: 'S1',
    macroCategoria: 'SOLIDITÀ',
    indiceTarget: 'Leverage',
    parametroLogico: 'Totale Debiti',
    tagDizionarioMaster: 'itcc-ci:TotaleDebiti',
  },
  {
    id: 'S2',
    macroCategoria: 'SOLIDITÀ',
    indiceTarget: 'Copertura Immobilizzazioni',
    parametroLogico: 'Immobilizzazioni',
    tagDizionarioMaster: 'itcc-ci:TotaleImmobilizzazioni',
  },

  {
    id: 'C1',
    macroCategoria: 'CCII_CRISI',
    indiceTarget: 'DSCR / Cash Flow',
    parametroLogico: 'Ammortamenti e Svalutazioni',
    tagDizionarioMaster:
      'itcc-ci:CostiProduzioneAmmortamentiSvalutazioniTotaleAmmortamentiSvalutazioni',
  },
  {
    id: 'C2',
    macroCategoria: 'CCII_CRISI',
    indiceTarget: 'DSCR / Cash Flow',
    parametroLogico: 'Accantonamenti',
    tagDizionarioMaster: 'itcc-ci:CostiProduzioneOneriDiversiGestioneOneriDiversiGestione',
  },
] as const;
