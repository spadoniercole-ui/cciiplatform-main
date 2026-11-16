// LE VOCI DELLA VERIFICA AZIENDA NEL REPORT (0.240.0).
//
// Erano nel motore di simulazione, che non esiste più. Il report dell'azienda
// le usa ancora per comporre la sezione «verifica azienda»: poche righe del
// prospetto, con le voci forti in evidenza. Stanno qui perché il report non
// deve dipendere da un motore di calcolo per leggere delle etichette.

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

export const VOCI_MAPPA: {
  etichetta: string;
  chiave: keyof DatiFinanziariPeriodo;
  forte?: boolean;
}[] = [
  { etichetta: 'Ricavi delle vendite', chiave: 'ricaviVendite' },
  { etichetta: 'Valore della produzione', chiave: 'valoreProduzione' },
  { etichetta: 'Costi della produzione', chiave: 'costiProduzione' },
  { etichetta: 'EBITDA', chiave: 'ebitda', forte: true },
  { etichetta: 'EBIT', chiave: 'ebit', forte: true },
  { etichetta: 'Risultato d’esercizio', chiave: 'utileEsercizio', forte: true },
  { etichetta: 'Patrimonio netto', chiave: 'patrimonioNetto', forte: true },
  { etichetta: 'Totale debiti', chiave: 'totaleDebiti' },
  { etichetta: 'Disponibilità liquide', chiave: 'disponibilitaLiquide' },
];
