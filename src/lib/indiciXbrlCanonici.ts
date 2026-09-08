// src/lib/indiciXbrlCanonici.ts
//
// I 9 indici che il motore XBRL calcola davvero (src/lib/xbrl/indici.ts:
// C1-C5 CNDCEC + ROE/ROI/ROT-ATT/INC-DEB), cablati qui come unica fonte
// per Parametri di Spazio e Configurazione Azienda.
//
// In un file separato perché i file 'use server' possono esportare SOLO
// funzioni async: una costante esportata da un file 'use server' fa
// fallire la build in produzione con "A 'use server' file can only export
// async functions, found object" — stesso errore già capitato due volte
// prima con RUOLI_ADMIN_SPAZIO e ORIGINI_PER_TIPO/MODULI_PERMESSO, e
// stavolta con questa. Nessuna nuova costante va MAI esportata
// direttamente da un file 'use server': va sempre qui o in un file
// analogo non-server.

export interface IndiceXbrlCanonico {
  id: number;
  codice: string;
  categoria: string;
  nome: string;
}

export const INDICI_XBRL_CANONICI: IndiceXbrlCanonico[] = [
  {
    id: 1,
    codice: 'C1',
    categoria: 'CNDCEC',
    nome: 'C1 — Sostenibilità dei debiti (Debiti / Ricavi)',
  },
  {
    id: 2,
    codice: 'C2',
    categoria: 'CNDCEC',
    nome: 'C2 — Adeguatezza patrimoniale (Patrimonio Netto / Debiti)',
  },
  { id: 3, codice: 'C3', categoria: 'CNDCEC', nome: 'C3 — Ritorno di liquidità su ricavi' },
  {
    id: 4,
    codice: 'C4',
    categoria: 'CNDCEC',
    nome: 'C4 — Copertura oneri finanziari (Valore Produzione / Oneri Finanziari)',
  },
  {
    id: 5,
    codice: 'C5',
    categoria: 'CNDCEC',
    nome: 'C5 — Indebitamento tributario/previdenziale su totale debiti',
  },
  {
    id: 6,
    codice: 'ROE',
    categoria: 'Altri Indici',
    nome: 'ROE — Return on Equity (Utile / Patrimonio Netto)',
  },
  {
    id: 7,
    codice: 'ROI',
    categoria: 'Altri Indici',
    nome: 'ROI — Return on Investment (EBIT / Totale Attivo)',
  },
  {
    id: 8,
    codice: 'ROT-ATT',
    categoria: 'Altri Indici',
    nome: "ROT-ATT — Rotazione dell'Attivo (Ricavi / Totale Attivo)",
  },
  {
    id: 9,
    codice: 'INC-DEB',
    categoria: 'Altri Indici',
    nome: "INC-DEB — Incidenza dell'Indebitamento (Debiti / Totale Attivo)",
  },
];
