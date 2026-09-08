// src/lib/xbrl/parametriTarget.ts
//
// Elenco dei parametri finanziari canonici che alimentano gli indici CCII
// (vedi indici.ts). Serve alla UI di parificazione tag per mostrare, per
// ciascun parametro, se è stato trovato un tag nel file oppure no.
// Se si aggiunge un nuovo indice in indici.ts che usa una nuova chiave di
// DatiFinanziariPeriodo, va aggiunta anche qui.

export interface ParametroTargetCcii {
  chiave: string; // deve coincidere con una chiave di DatiFinanziariPeriodo
  indiceTarget: string;
  parametroLogico: string;
}

export const PARAMETRI_TARGET_CCII: ParametroTargetCcii[] = [
  {
    chiave: 'ricaviVendite',
    indiceTarget: 'C1 / C3',
    parametroLogico: 'Ricavi delle vendite e prestazioni',
  },
  { chiave: 'valoreProduzione', indiceTarget: 'C4', parametroLogico: 'Valore della produzione' },
  { chiave: 'totaleDebiti', indiceTarget: 'C1 / C2 / C5', parametroLogico: 'Totale debiti' },
  { chiave: 'patrimonioNetto', indiceTarget: 'C2', parametroLogico: 'Patrimonio netto' },
  { chiave: 'disponibilitaLiquide', indiceTarget: 'C3', parametroLogico: 'Disponibilità liquide' },
  { chiave: 'oneriFinanziari', indiceTarget: 'C4', parametroLogico: 'Oneri finanziari' },
  { chiave: 'debitiTributari', indiceTarget: 'C5', parametroLogico: 'Debiti tributari' },
  { chiave: 'debitiPrevidenziali', indiceTarget: 'C5', parametroLogico: 'Debiti previdenziali' },
];
