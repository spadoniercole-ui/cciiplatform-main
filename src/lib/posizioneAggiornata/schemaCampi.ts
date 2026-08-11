// src/lib/posizioneAggiornata/schemaCampi.ts
//
// Schema dei campi per la Posizione Aggiornata — stessa forma dati già
// usata per anno corrente/precedente dal motore XBRL (DatiFinanziariPeriodo,
// src/lib/xbrl/types.ts), organizzata secondo la logica CE a valore della
// produzione (art. 2425 c.c.) e SP a criterio finanziario. Non è lo
// schema civilistico completo voce per voce — è il sottoinsieme
// aggregato che il motore XBRL estrae davvero e che gli Indici già
// sanno leggere: usare la stessa forma per i tre periodi (precedente,
// corrente, aggiornata) rende "Indici multi-periodo" un riuso diretto
// delle formule esistenti, non un nuovo motore.

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

export type ChiaveCampoPosizione = keyof DatiFinanziariPeriodo;

export interface CampoPosizione {
  chiave: ChiaveCampoPosizione;
  etichetta: string;
  gruppo: 'CE' | 'SP';
}

export const CAMPI_POSIZIONE: CampoPosizione[] = [
  // Conto Economico, schema a valore della produzione
  { chiave: 'ricaviVendite', etichetta: 'Ricavi delle vendite e delle prestazioni', gruppo: 'CE' },
  { chiave: 'valoreProduzione', etichetta: 'A) Valore della produzione', gruppo: 'CE' },
  { chiave: 'costiProduzione', etichetta: 'B) Costi della produzione', gruppo: 'CE' },
  {
    chiave: 'ebit',
    etichetta: 'Differenza tra valore e costi della produzione (A-B)',
    gruppo: 'CE',
  },
  { chiave: 'ammortamenti', etichetta: 'di cui Ammortamenti e svalutazioni', gruppo: 'CE' },
  { chiave: 'ebitda', etichetta: 'EBITDA (margine operativo lordo)', gruppo: 'CE' },
  { chiave: 'oneriFinanziari', etichetta: 'C) Oneri finanziari', gruppo: 'CE' },
  { chiave: 'utileEsercizio', etichetta: "Utile (perdita) dell'esercizio", gruppo: 'CE' },
  // Stato Patrimoniale, criterio finanziario (liquidità/esigibilità)
  { chiave: 'totaleAttivo', etichetta: 'Totale Attivo', gruppo: 'SP' },
  { chiave: 'immobilizzazioni', etichetta: 'Immobilizzazioni (Attivo Fisso)', gruppo: 'SP' },
  { chiave: 'attivoCircolante', etichetta: 'Attivo Circolante', gruppo: 'SP' },
  { chiave: 'creditiClienti', etichetta: 'di cui Crediti verso clienti', gruppo: 'SP' },
  { chiave: 'disponibilitaLiquide', etichetta: 'di cui Disponibilità liquide', gruppo: 'SP' },
  { chiave: 'patrimonioNetto', etichetta: 'Patrimonio Netto (Mezzi Propri)', gruppo: 'SP' },
  { chiave: 'totaleDebiti', etichetta: 'Totale Debiti', gruppo: 'SP' },
  { chiave: 'debitiBanche', etichetta: 'di cui Debiti verso banche', gruppo: 'SP' },
  { chiave: 'debitiFornitori', etichetta: 'di cui Debiti verso fornitori', gruppo: 'SP' },
  { chiave: 'debitiTributari', etichetta: 'di cui Debiti tributari', gruppo: 'SP' },
  { chiave: 'debitiPrevidenziali', etichetta: 'di cui Debiti previdenziali', gruppo: 'SP' },
  { chiave: 'passivoCorrente', etichetta: 'Passivo Corrente (breve termine)', gruppo: 'SP' },
];

export const DATI_VUOTI: DatiFinanziariPeriodo = {
  ricaviVendite: 0,
  valoreProduzione: 0,
  costiProduzione: 0,
  ebit: 0,
  ammortamenti: 0,
  ebitda: 0,
  oneriFinanziari: 0,
  utileEsercizio: 0,
  totaleAttivo: 0,
  attivoCircolante: 0,
  creditiClienti: 0,
  disponibilitaLiquide: 0,
  immobilizzazioni: 0,
  patrimonioNetto: 0,
  totaleDebiti: 0,
  debitiBanche: 0,
  debitiFornitori: 0,
  debitiTributari: 0,
  debitiPrevidenziali: 0,
  passivoCorrente: 0,
};
