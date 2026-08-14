// Tipo realmente usato da ModuloIndici.tsx (schermata "Dizionario Indici
// Tassonomia XBRL"). Mancava del tutto: l'errore di compilazione era
// silenziato da `ignoreBuildErrors: true` in next.config.mjs, ora rimosso.
export interface IndiceXbrl {
  id: string;
  categoria: string;
  nome: string;
  formula: string;
  xbrlTag: string;
  attivo: boolean;
}

export interface IndiceCCII {
  codice: string;
  nome: string;
  valore: number | string;
  soglia: string;
  esito: 'OK' | 'VIOLATO' | 'NON_CALCOLABILE';
}

export const MAPPA_7_INDICI_CCII = [
  {
    codice: 'I1',
    nome: 'Patrimonio Netto (Presenza di Patrimonio Netto negativo)',
    soglia: '> 0 €',
  },
  { codice: 'I2', nome: 'DSCR a 6 mesi (Debt Service Coverage Ratio)', soglia: '> 1.00' },
  {
    codice: 'I3',
    nome: 'Indice di Sostenibilità dei Debiti (Debiti Totali / Ricavi)',
    soglia: '< 0.80',
  },
  {
    codice: 'I4',
    nome: 'Adeguatezza Patrimoniale (Patrimonio Netto / Totale Debiti)',
    soglia: '> 0.10',
  },
  {
    codice: 'I5',
    nome: 'Ritorno di Liquidità su Ricavi (Disponibilità Liquide / Ricavi)',
    soglia: '> 0.02',
  },
  {
    codice: 'I6',
    nome: 'Copertura Oneri Finanziari (Valore Produzione / Oneri Finanziari)',
    soglia: '> 2.00',
  },
  {
    codice: 'I7',
    nome: 'Indebitamento Tributario e Previdenziale su Totale Debiti',
    soglia: '< 0.30',
  },
];
