// src/lib/demo/documenti.ts
//
// I DOCUMENTI DELLA DEMO (0.174.0).
//
// Non sono allegati di produzione: sono file statici, con la filigrana
// «DEMO», che servono a mostrare come il prodotto acquisisce, legge e
// confronta la documentazione. La demo non deve mai chiedere all'operatore di
// scegliere un file vero: i documenti sono già associati all'azienda e al
// percorso, e il caricamento che si vede è una simulazione.
//
// I file stanno in public/demo e vengono generati da
// scripts/genera-demo-files.mjs. Questo modulo è l'unico elenco dei nomi e
// dei percorsi: UI, seed e simulazione leggono da qui.

export type FormatoDocumentoDemo = 'PDF' | 'XBRL' | 'EXCEL';

export interface DocumentoDemo {
  nome: string;
  percorso: string;
  formato: FormatoDocumentoDemo;
  azienda: string;
  descrizione: string;
}

export const AZIENDA_MECCANICA = 'Meccanica Valsesia Demo S.r.l.';
export const AZIENDA_TESSITURA = 'Tessitura Lario Demo S.p.A.';
export const AZIENDA_LOGISTICA = 'Logistica Padana Demo S.r.l.';

export const PACCHETTO_DOCUMENTI_DEMO = '/demo/documenti-demo.zip';

export const DOCUMENTI_DEMO: DocumentoDemo[] = [
  {
    nome: 'fascicolo-storico-meccanica-valsesia.pdf',
    percorso: '/demo/fascicolo-storico-meccanica-valsesia.pdf',
    formato: 'PDF',
    azienda: AZIENDA_MECCANICA,
    descrizione: 'Fascicolo storico e visura camerale',
  },
  {
    nome: 'bilancio-meccanica-valsesia-2025.xlsx',
    percorso: '/demo/bilancio-meccanica-valsesia-2025.xlsx',
    formato: 'EXCEL',
    azienda: AZIENDA_MECCANICA,
    descrizione: 'Bilancio 2025 — prospetto dimostrativo',
  },
  {
    nome: 'certificazione-debiti-meccanica-valsesia.xlsx',
    percorso: '/demo/certificazione-debiti-meccanica-valsesia.xlsx',
    formato: 'EXCEL',
    azienda: AZIENDA_MECCANICA,
    descrizione: 'Certificazione dei debiti',
  },
  {
    nome: 'proposta-meccanica-valsesia.pdf',
    percorso: '/demo/proposta-meccanica-valsesia.pdf',
    formato: 'PDF',
    azienda: AZIENDA_MECCANICA,
    descrizione: 'Proposta di concordato',
  },
  {
    nome: 'fascicolo-storico-tessitura-lario.pdf',
    percorso: '/demo/fascicolo-storico-tessitura-lario.pdf',
    formato: 'PDF',
    azienda: AZIENDA_TESSITURA,
    descrizione: 'Fascicolo storico e visura camerale',
  },
  {
    nome: 'bilancio-tessitura-lario-2025.xlsx',
    percorso: '/demo/bilancio-tessitura-lario-2025.xlsx',
    formato: 'EXCEL',
    azienda: AZIENDA_TESSITURA,
    descrizione: 'Bilancio 2025 — prospetto dimostrativo',
  },
  {
    nome: 'certificazione-debiti-tessitura-lario.xlsx',
    percorso: '/demo/certificazione-debiti-tessitura-lario.xlsx',
    formato: 'EXCEL',
    azienda: AZIENDA_TESSITURA,
    descrizione: 'Certificazione dei debiti',
  },
  {
    nome: 'decreto-liquidazione-tessitura-lario.pdf',
    percorso: '/demo/decreto-liquidazione-tessitura-lario.pdf',
    formato: 'PDF',
    azienda: AZIENDA_TESSITURA,
    descrizione: 'Decreto di liquidazione giudiziale',
  },
  {
    nome: 'stato-passivo-tessitura-lario.pdf',
    percorso: '/demo/stato-passivo-tessitura-lario.pdf',
    formato: 'PDF',
    azienda: AZIENDA_TESSITURA,
    descrizione: 'Stato passivo — allegato al decreto',
  },
  {
    nome: 'fascicolo-storico-logistica-padana.pdf',
    percorso: '/demo/fascicolo-storico-logistica-padana.pdf',
    formato: 'PDF',
    azienda: AZIENDA_LOGISTICA,
    descrizione: 'Fascicolo storico e visura camerale',
  },
  {
    nome: 'bilancio-logistica-padana-2025.xlsx',
    percorso: '/demo/bilancio-logistica-padana-2025.xlsx',
    formato: 'EXCEL',
    azienda: AZIENDA_LOGISTICA,
    descrizione: 'Bilancio 2025 — prospetto dimostrativo',
  },
  {
    nome: 'certificazione-debiti-logistica-padana.xlsx',
    percorso: '/demo/certificazione-debiti-logistica-padana.xlsx',
    formato: 'EXCEL',
    azienda: AZIENDA_LOGISTICA,
    descrizione: 'Certificazione dei debiti',
  },
  {
    nome: 'dispositivo-cram-down-logistica-padana.pdf',
    percorso: '/demo/dispositivo-cram-down-logistica-padana.pdf',
    formato: 'PDF',
    azienda: AZIENDA_LOGISTICA,
    descrizione: 'Dispositivo di cram down',
  },
];

const PER_AZIENDA = new Map(DOCUMENTI_DEMO.map((d) => [`${d.azienda}|${d.nome}`, d]));

function perAzienda(azienda: string, nome: string): DocumentoDemo | null {
  return PER_AZIENDA.get(`${azienda}|${nome}`) ?? null;
}

/** Il fascicolo storico (PDF) dell'azienda demo, per codice fiscale. */
export function fascicoloDemoPerCodiceFiscale(codiceFiscale: string | null | undefined) {
  if (!codiceFiscale) return null;
  const azienda =
    codiceFiscale === '00000000101'
      ? AZIENDA_MECCANICA
      : codiceFiscale === '00000000102'
        ? AZIENDA_TESSITURA
        : codiceFiscale === '00000000103'
          ? AZIENDA_LOGISTICA
          : null;
  if (!azienda) return null;
  const nome =
    azienda === AZIENDA_MECCANICA
      ? 'fascicolo-storico-meccanica-valsesia.pdf'
      : azienda === AZIENDA_TESSITURA
        ? 'fascicolo-storico-tessitura-lario.pdf'
        : 'fascicolo-storico-logistica-padana.pdf';
  return perAzienda(azienda, nome);
}

/** Il prospetto di bilancio (Excel) dell'azienda demo. */
export function bilancioDemoPerCodiceFiscale(codiceFiscale: string | null | undefined) {
  if (!codiceFiscale) return null;
  if (codiceFiscale === '00000000101')
    return perAzienda(AZIENDA_MECCANICA, 'bilancio-meccanica-valsesia-2025.xlsx');
  if (codiceFiscale === '00000000102')
    return perAzienda(AZIENDA_TESSITURA, 'bilancio-tessitura-lario-2025.xlsx');
  if (codiceFiscale === '00000000103')
    return perAzienda(AZIENDA_LOGISTICA, 'bilancio-logistica-padana-2025.xlsx');
  return null;
}

/** I documenti del provvedimento del giudice per l'azienda demo. */
export function documentiProvvedimentoDemo(codiceFiscale: string) {
  if (codiceFiscale === '00000000102') {
    return [
      perAzienda(AZIENDA_TESSITURA, 'decreto-liquidazione-tessitura-lario.pdf'),
      perAzienda(AZIENDA_TESSITURA, 'stato-passivo-tessitura-lario.pdf'),
    ].filter((d): d is DocumentoDemo => d !== null);
  }
  if (codiceFiscale === '00000000103') {
    return [perAzienda(AZIENDA_LOGISTICA, 'dispositivo-cram-down-logistica-padana.pdf')].filter(
      (d): d is DocumentoDemo => d !== null
    );
  }
  return [];
}

/**
 * I documenti che la schermata di caricamento mostra come già selezionati.
 * Si scelgono dal tipo di file che quel punto accetta: PDF, XBRL/XML o Excel.
 * Per l'XBRL si mostrano i prospetti Excel demo, che sono la rappresentazione
 * leggibile dello stesso bilancio; il file XBRL grezzo non serve alla demo.
 */
export function documentiDemoPerAccettazione(accept: string | null | undefined): DocumentoDemo[] {
  const a = (accept ?? '').toLowerCase();
  if (a.includes('xbrl') || a.includes('xml')) {
    return DOCUMENTI_DEMO.filter((d) => d.nome.startsWith('bilancio-'));
  }
  if (a.includes('pdf')) {
    return DOCUMENTI_DEMO.filter((d) => d.formato === 'PDF');
  }
  if (a.includes('xls') || a.includes('csv') || a.includes('ods') || a.includes('excel')) {
    return DOCUMENTI_DEMO.filter((d) => d.formato === 'EXCEL' && !d.nome.startsWith('bilancio-'));
  }
  return DOCUMENTI_DEMO;
}
