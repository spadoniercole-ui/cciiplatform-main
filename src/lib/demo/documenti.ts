// src/lib/demo/documenti.ts
//
// I DOCUMENTI DELLA DEMO (0.174.2).
//
// Non sono allegati di produzione: sono file statici, con la filigrana
// «DEMO», che servono a mostrare come il prodotto acquisisce, legge e
// confronta la documentazione. La demo non deve mai chiedere all'operatore di
// scegliere un file vero: i documenti sono già associati all'azienda e al
// percorso, e il caricamento che si vede è una simulazione.
//
// OGNI DOCUMENTO HA UN RUOLO. La schermata di acquisizione non mostra più
// tutti i file di tutte le aziende: filtra per azienda e usa il ruolo per
// preselezionare i documenti giusti (fascicolo, bilancio, certificazione,
// proposta, provvedimento). Così la scelta è credibile e non sembra che il
// sistema giri «senza criterio».
//
// I file stanno in public/demo e vengono generati da
// scripts/genera-demo-files.mjs. Questo modulo è l'unico elenco dei nomi e
// dei percorsi: UI, seed e simulazione leggono da qui.

export type FormatoDocumentoDemo = 'PDF' | 'XBRL' | 'EXCEL';

export type RuoloDocumentoDemo =
  'FASCICOLO' | 'BILANCIO' | 'CERTIFICAZIONE' | 'PROPOSTA' | 'PROVVEDIMENTO' | 'STATO_PASSIVO';

export interface DocumentoDemo {
  nome: string;
  percorso: string;
  formato: FormatoDocumentoDemo;
  azienda: string;
  descrizione: string;
  ruolo: RuoloDocumentoDemo;
}

export const AZIENDA_MECCANICA = 'Meccanica Valsesia Demo S.r.l.';
export const AZIENDA_TESSITURA = 'Tessitura Lario Demo S.p.A.';
export const AZIENDA_LOGISTICA = 'Logistica Padana Demo S.r.l.';
export const AZIENDA_CANTIERI = 'Cantieri Brianza Demo S.r.l.';

export const PACCHETTO_DOCUMENTI_DEMO = '/demo/documenti-demo.zip';

const documento = (
  azienda: string,
  nome: string,
  formato: FormatoDocumentoDemo,
  descrizione: string,
  ruolo: RuoloDocumentoDemo
): DocumentoDemo => ({
  nome,
  percorso: `/demo/${nome}`,
  formato,
  azienda,
  descrizione,
  ruolo,
});

export const DOCUMENTI_DEMO: DocumentoDemo[] = [
  // Meccanica Valsesia — proposta/concordato.
  documento(
    AZIENDA_MECCANICA,
    'fascicolo-storico-meccanica-valsesia.pdf',
    'PDF',
    'Fascicolo storico e visura camerale',
    'FASCICOLO'
  ),
  documento(
    AZIENDA_MECCANICA,
    'bilancio-meccanica-valsesia-2025.xlsx',
    'EXCEL',
    'Bilancio 2025 — prospetto dimostrativo',
    'BILANCIO'
  ),
  documento(
    AZIENDA_MECCANICA,
    'certificazione-debiti-meccanica-valsesia.xlsx',
    'EXCEL',
    'Certificazione dei debiti',
    'CERTIFICAZIONE'
  ),
  documento(
    AZIENDA_MECCANICA,
    'proposta-meccanica-valsesia.pdf',
    'PDF',
    'Proposta di concordato',
    'PROPOSTA'
  ),

  // Tessitura Lario — liquidazione giudiziale.
  documento(
    AZIENDA_TESSITURA,
    'fascicolo-storico-tessitura-lario.pdf',
    'PDF',
    'Fascicolo storico e visura camerale',
    'FASCICOLO'
  ),
  documento(
    AZIENDA_TESSITURA,
    'bilancio-tessitura-lario-2025.xlsx',
    'EXCEL',
    'Bilancio 2025 — prospetto dimostrativo',
    'BILANCIO'
  ),
  documento(
    AZIENDA_TESSITURA,
    'certificazione-debiti-tessitura-lario.xlsx',
    'EXCEL',
    'Certificazione dei debiti',
    'CERTIFICAZIONE'
  ),
  documento(
    AZIENDA_TESSITURA,
    'decreto-liquidazione-tessitura-lario.pdf',
    'PDF',
    'Decreto di liquidazione giudiziale',
    'PROVVEDIMENTO'
  ),
  documento(
    AZIENDA_TESSITURA,
    'stato-passivo-tessitura-lario.pdf',
    'PDF',
    'Stato passivo — allegato al decreto',
    'STATO_PASSIVO'
  ),

  // Logistica Padana — cram down.
  documento(
    AZIENDA_LOGISTICA,
    'fascicolo-storico-logistica-padana.pdf',
    'PDF',
    'Fascicolo storico e visura camerale',
    'FASCICOLO'
  ),
  documento(
    AZIENDA_LOGISTICA,
    'bilancio-logistica-padana-2025.xlsx',
    'EXCEL',
    'Bilancio 2025 — prospetto dimostrativo',
    'BILANCIO'
  ),
  documento(
    AZIENDA_LOGISTICA,
    'certificazione-debiti-logistica-padana.xlsx',
    'EXCEL',
    'Certificazione dei debiti',
    'CERTIFICAZIONE'
  ),
  documento(
    AZIENDA_LOGISTICA,
    'dispositivo-cram-down-logistica-padana.pdf',
    'PDF',
    'Dispositivo di cram down',
    'PROVVEDIMENTO'
  ),

  // Cantieri Brianza — la valutazione aperta: nessun percorso precostituito.
  documento(
    AZIENDA_CANTIERI,
    'fascicolo-storico-cantieri-brianza.pdf',
    'PDF',
    'Fascicolo storico e visura camerale',
    'FASCICOLO'
  ),
  documento(
    AZIENDA_CANTIERI,
    'bilancio-cantieri-brianza-2025.xlsx',
    'EXCEL',
    'Bilancio 2025 — prospetto dimostrativo',
    'BILANCIO'
  ),
  documento(
    AZIENDA_CANTIERI,
    'certificazione-debiti-cantieri-brianza.xlsx',
    'EXCEL',
    'Certificazione dei debiti',
    'CERTIFICAZIONE'
  ),
  documento(
    AZIENDA_CANTIERI,
    'proposta-cantieri-brianza.pdf',
    'PDF',
    'Proposta depositata — documento dimostrativo',
    'PROPOSTA'
  ),
  documento(
    AZIENDA_CANTIERI,
    'decreto-liquidazione-cantieri-brianza.pdf',
    'PDF',
    'Decreto di liquidazione giudiziale — variante demo',
    'PROVVEDIMENTO'
  ),
  documento(
    AZIENDA_CANTIERI,
    'dispositivo-cram-down-cantieri-brianza.pdf',
    'PDF',
    'Dispositivo di cram down — variante demo',
    'PROVVEDIMENTO'
  ),
];

const normalizza = (valore: string) => valore.trim().toLocaleLowerCase('it-IT');

const PER_AZIENDA = new Map(DOCUMENTI_DEMO.map((d) => [`${normalizza(d.azienda)}|${d.nome}`, d]));

function perAzienda(azienda: string, nome: string): DocumentoDemo | null {
  return PER_AZIENDA.get(`${normalizza(azienda)}|${nome}`) ?? null;
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
          : codiceFiscale === '00000000104'
            ? AZIENDA_CANTIERI
            : null;
  if (!azienda) return null;
  const nome =
    azienda === AZIENDA_MECCANICA
      ? 'fascicolo-storico-meccanica-valsesia.pdf'
      : azienda === AZIENDA_TESSITURA
        ? 'fascicolo-storico-tessitura-lario.pdf'
        : azienda === AZIENDA_LOGISTICA
          ? 'fascicolo-storico-logistica-padana.pdf'
          : 'fascicolo-storico-cantieri-brianza.pdf';
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
  if (codiceFiscale === '00000000104')
    return perAzienda(AZIENDA_CANTIERI, 'bilancio-cantieri-brianza-2025.xlsx');
  return null;
}

/**
 * I documenti del provvedimento del giudice per l'azienda demo.
 * Per la valutazione aperta restituisce entrambe le varianti se non è ancora
 * stato scelto il percorso; dopo la scelta si filtra con `tipo`.
 */
export function documentiProvvedimentoDemo(
  codiceFiscale: string,
  tipo?: 'PROPOSTA' | 'DECRETO_LIQUIDAZIONE' | 'CRAM_DOWN' | 'DA_CHIEDERE'
) {
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
  if (codiceFiscale === '00000000104') {
    const decreto = perAzienda(AZIENDA_CANTIERI, 'decreto-liquidazione-cantieri-brianza.pdf');
    const dispositivo = perAzienda(AZIENDA_CANTIERI, 'dispositivo-cram-down-cantieri-brianza.pdf');
    if (tipo === 'DECRETO_LIQUIDAZIONE') return decreto ? [decreto] : [];
    if (tipo === 'CRAM_DOWN') return dispositivo ? [dispositivo] : [];
    return [decreto, dispositivo].filter((d): d is DocumentoDemo => d !== null);
  }
  return [];
}

/**
 * I documenti compatibili con il campo file, senza guardare l'azienda.
 * Resta il punto unico per i test e per i caricamenti fuori da un contesto
 * aziendale; la schermata demo usa `documentiDemoPerAzienda`.
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

/**
 * I documenti proponibili per una specifica azienda demo.
 *
 * Il filtro per azienda è il punto che evita la confusione vista in demo:
 * il decreto di Tessitura non compare mentre si carica la proposta di
 * Meccanica, e il dispositivo di Logistica non compare nel fascicolo di
 * Tessitura.
 */
export function documentiDemoPerAzienda(
  azienda: string | null | undefined,
  accept: string | null | undefined
): DocumentoDemo[] {
  if (!azienda) return [];
  const cercata = normalizza(azienda);
  return documentiDemoPerAccettazione(accept).filter((d) => normalizza(d.azienda) === cercata);
}

/**
 * I documenti che il campo file propone come già spuntati, in base al ruolo
 * dichiarato dal campo (`data-demo-ruoli`). Se il campo non dichiara ruoli,
 * sono proposti tutti i documenti compatibili dell'azienda.
 */
export function documentiDemoSelezionati(
  azienda: string | null | undefined,
  accept: string | null | undefined,
  ruoli: string | null | undefined
): DocumentoDemo[] {
  const candidati = documentiDemoPerAzienda(azienda, accept);
  const richiesti = new Set(
    (ruoli ?? '')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean)
  );
  if (richiesti.size === 0) return candidati;
  return candidati.filter((d) => richiesti.has(d.ruolo));
}
