// src/lib/demo/parametriEnte.ts
//
// I PARAMETRI CON CUI NASCE LO SPAZIO DEMO (0.173.0).
//
// Sono quelli della configurazione esportata da SPAZIODEMORICEVE-2026-001 il
// 5 novembre 2026: soglie art. 25-novies, riscontro della proposta, ipotesi
// degli scenari per rango e schede XBRL. Non sono dati d'azienda e non
// contengono PDF: sono la configurazione che rende leggibili triage,
// screening e scenario appena creato lo spazio.
//
// Il file è volutamente ridotto alle tabelle che servono al percorso demo.
// Le altre sezioni dell'export (Check List ministeriale, prodotti, testi)
// restano quelle che lo spazio crea da sé: importarle qui vorrebbe dire
// sostituire configurazioni che l'utente può aver già personalizzato.

import { APP_VERSION } from '@/lib/appVersion';
import {
  FORMATO_CONFIGURAZIONE,
  VERSIONE_FORMATO,
  type FileConfigurazione,
} from '@/lib/configurazioneSpazio/configurazione';

export const PARAMETRI_DEMO: FileConfigurazione = {
  formato: FORMATO_CONFIGURAZIONE,
  versione: VERSIONE_FORMATO,
  appVersion: APP_VERSION,
  esportatoIl: '2026-11-05T00:00:00.000Z',
  spazio: { codice: 'DEMO', tipoSpazio: 'ENTE' },
  // Le direttrici le scrive il percorso demo con la sua struttura: qui non
  // vogliamo sovrascrivere quelle eventualmente già presenti.
  globale: { direttriciEnteStrutturate: null },
  tabelle: {
    parametri_soglie_25novies: {
      righe: [
        {
          id: 1,
          inps_percentuale: '0.30',
          inps_importo_con_lavoratori: '15000',
          inps_importo_senza_lavoratori: '5000',
          inail: '5000',
          iva_importo: '5000',
          iva_percentuale_volume_affari: '0.10',
          iva_importo_assoluto: '20000',
          aer_impresa_individuale: '100000',
          aer_societa_persone: '200000',
          aer_altre_societa: '500000',
          giorni_ritardo: 90,
          aggiornato_il: '2026-09-16T19:51:43.637Z',
        },
      ],
    },
    limiti_ricevibilita: {
      righe: [
        {
          id: 1,
          categoria_creditore: '__ENTE__',
          percentuale_minima: 100,
          unica_soluzione_ammessa: true,
          rateizzazione_ammessa: true,
          note: '',
          valore_liquidazione_stimato: null,
          alias: [],
          ente_25novies: 'INPS',
        },
      ],
    },
    limiti_ricevibilita_rango: {
      righe: [
        {
          rango_legale: 'PREDEDUCIBILE',
          percentuale_minima: 0,
          unica_soluzione_ammessa: true,
          rateizzazione_ammessa: true,
          valore_liquidazione_stimato: null,
          note: null,
        },
        {
          rango_legale: 'PRIVILEGIATO_IPOTECA',
          percentuale_minima: 0,
          unica_soluzione_ammessa: true,
          rateizzazione_ammessa: true,
          valore_liquidazione_stimato: null,
          note: null,
        },
        {
          rango_legale: 'PRIVILEGIATO_GENERALE',
          percentuale_minima: 0,
          unica_soluzione_ammessa: true,
          rateizzazione_ammessa: true,
          valore_liquidazione_stimato: null,
          note: null,
        },
        {
          rango_legale: 'PRIVILEGIATO',
          percentuale_minima: 0,
          unica_soluzione_ammessa: true,
          rateizzazione_ammessa: true,
          valore_liquidazione_stimato: null,
          note: null,
        },
        {
          rango_legale: 'CHIROGRAFARIO',
          percentuale_minima: 0,
          unica_soluzione_ammessa: true,
          rateizzazione_ammessa: true,
          valore_liquidazione_stimato: null,
          note: null,
        },
        {
          rango_legale: 'POSTERGATO',
          percentuale_minima: 0,
          unica_soluzione_ammessa: true,
          rateizzazione_ammessa: true,
          valore_liquidazione_stimato: null,
          note: null,
        },
      ],
    },
    parametri_scenari: {
      righe: [
        {
          id: 1,
          costi_procedura_pct: '20',
          aggiornato_il: '2026-11-04T14:48:26.402Z',
          soddisfazione_attesa_pct: null,
        },
      ],
    },
    parametri_scenari_rango: {
      righe: [
        {
          rango: 'PREDEDUCIBILE',
          tasso_liquidazione_pct: '100',
          cram_down_pct: '100',
          aggiornato_il: '2026-11-04T14:48:26.402Z',
        },
        {
          rango: 'PRIVILEGIATO',
          tasso_liquidazione_pct: '30.5',
          cram_down_pct: '50',
          aggiornato_il: '2026-11-04T14:48:26.402Z',
        },
        {
          rango: 'CHIROGRAFARIO',
          tasso_liquidazione_pct: '6.4',
          cram_down_pct: '20',
          aggiornato_il: '2026-11-04T14:48:26.402Z',
        },
        {
          rango: 'POSTERGATO',
          tasso_liquidazione_pct: '0',
          cram_down_pct: null,
          aggiornato_il: '2026-11-04T14:48:26.402Z',
        },
      ],
    },
    xbrl_tab_abilitate: {
      righe: [
        { id: 1, tab_codice: 'cndec', abilitato: true },
        { id: 2, tab_codice: 'altri_indici', abilitato: true },
        { id: 3, tab_codice: 'debitoria', abilitato: true },
        { id: 4, tab_codice: 'storico', abilitato: true },
      ],
    },
  },
};
