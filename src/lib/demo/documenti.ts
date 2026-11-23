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
  | 'FASCICOLO'
  | 'BILANCIO'
  | 'CERTIFICAZIONE'
  | 'PROPOSTA'
  | 'PROVVEDIMENTO'
  | 'STATO_PASSIVO'
  | 'DENUNCE'
  | 'DELEGHE'
  | 'CHECKLIST';

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
    'bilancio-meccanica-valsesia-2025.xbrl',
    'XBRL',
    'Bilancio 2025 — istanza XBRL letta dal motore',
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
  documento(
    AZIENDA_MECCANICA,
    'dispositivo-cram-down-meccanica-valsesia.pdf',
    'PDF',
    'Dispositivo di cram down — alternativa alla proposta',
    'PROVVEDIMENTO'
  ),
  documento(
    AZIENDA_MECCANICA,
    'checklist-prodotti-meccanica-valsesia.xlsx',
    'EXCEL',
    'Check list dei prodotti — compilata',
    'CHECKLIST'
  ),

  // Tessitura Lario — si ferma alla verifica contabile: bilancio, visura,
  // certificazione. Nessun atto: lo scenario non è ancora stato aperto.
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
    'bilancio-tessitura-lario-2025.xbrl',
    'XBRL',
    'Bilancio 2025 — istanza XBRL letta dal motore',
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
    'checklist-prodotti-tessitura-lario.xlsx',
    'EXCEL',
    'Check list dei prodotti — compilata',
    'CHECKLIST'
  ),

  documento(
    AZIENDA_LOGISTICA,
    'fascicolo-storico-logistica-padana.pdf',
    'PDF',
    'Fascicolo storico e visura camerale',
    'FASCICOLO'
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
    'elenco-denunce-dm10-logistica-padana.xlsx',
    'EXCEL',
    'Elenco denunce DM10',
    'DENUNCE'
  ),
  documento(
    AZIENDA_LOGISTICA,
    'elenco-deleghe-f24-logistica-padana.xlsx',
    'EXCEL',
    'Elenco deleghe di pagamento F24',
    'DELEGHE'
  ),
  documento(
    AZIENDA_LOGISTICA,
    'checklist-prodotti-logistica-padana.xlsx',
    'EXCEL',
    'Check list dei prodotti — compilata',
    'CHECKLIST'
  ),
];

const normalizza = (valore: string) => valore.trim().toLocaleLowerCase('it-IT');

/**
 * IL MARCHIO DEL SET DEMO (0.256.0).
 *
 * In uno spazio demo l'unico caricamento ammesso è un file del set: la
 * riconoscibilità è il nome, perché il set è generato da questo stesso elenco
 * (`scripts/genera-demo-files.mjs`) e chi scarica il pacchetto riporta a
 * bordo gli stessi nomi. Il controllo vive qui, accanto ai nomi, e lo usa la
 * route di upload solo quando lo spazio è demo.
 */
const NOMI_DEMO = new Set(DOCUMENTI_DEMO.map((d) => normalizza(d.nome)));

export function eDocumentoDemo(nome: string | null | undefined): boolean {
  if (!nome) return false;
  const base = nome.split(/[\\/]/).pop() ?? nome;
  return NOMI_DEMO.has(normalizza(base));
}

const PER_AZIENDA = new Map(DOCUMENTI_DEMO.map((d) => [`${normalizza(d.azienda)}|${d.nome}`, d]));

function perAzienda(azienda: string, nome: string): DocumentoDemo | null {
  return PER_AZIENDA.get(`${normalizza(azienda)}|${nome}`) ?? null;
}

/** Il fascicolo storico (PDF) dell'azienda demo, per codice fiscale. */
export function fascicoloDemoPerCodiceFiscale(codiceFiscale: string | null | undefined) {
  if (!codiceFiscale) return null;
  const mappa: Record<string, { azienda: string; nome: string }> = {
    '00000000101': {
      azienda: AZIENDA_MECCANICA,
      nome: 'fascicolo-storico-meccanica-valsesia.pdf',
    },
    '00000000102': { azienda: AZIENDA_TESSITURA, nome: 'fascicolo-storico-tessitura-lario.pdf' },
    '00000000103': { azienda: AZIENDA_LOGISTICA, nome: 'fascicolo-storico-logistica-padana.pdf' },
  };
  const voce = mappa[codiceFiscale];
  return voce ? perAzienda(voce.azienda, voce.nome) : null;
}

/** Il prospetto di bilancio (Excel) dell'azienda demo. */
export function bilancioDemoPerCodiceFiscale(codiceFiscale: string | null | undefined) {
  if (!codiceFiscale) return null;
  if (codiceFiscale === '00000000101')
    return perAzienda(AZIENDA_MECCANICA, 'bilancio-meccanica-valsesia-2025.xlsx');
  if (codiceFiscale === '00000000102')
    return perAzienda(AZIENDA_TESSITURA, 'bilancio-tessitura-lario-2025.xlsx');
  // Logistica non ha bilancio: si ferma alla verifica amministrativa.
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
  if (codiceFiscale === '00000000101') {
    // La Meccanica valuta due atti: l'accordo e, in alternativa, il cram down.
    const proposta = perAzienda(AZIENDA_MECCANICA, 'proposta-meccanica-valsesia.pdf');
    const dispositivo = perAzienda(
      AZIENDA_MECCANICA,
      'dispositivo-cram-down-meccanica-valsesia.pdf'
    );
    if (tipo === 'CRAM_DOWN') return dispositivo ? [dispositivo] : [];
    if (tipo === 'PROPOSTA') return proposta ? [proposta] : [];
    return [proposta, dispositivo].filter((d): d is DocumentoDemo => d !== null);
  }
  // Tessitura e Logistica non hanno un atto: la demo le ferma prima dello
  // scenario, quindi non esiste un provvedimento da proporre.
  return [];
}

/**
 * I documenti compatibili con il campo file, senza guardare l'azienda.
 * Resta il punto unico per i test e per i caricamenti fuori da un contesto
 * aziendale; la schermata demo usa `documentiDemoPerAzienda`.
 */
export function documentiDemoPerAccettazione(accept: string | null | undefined): DocumentoDemo[] {
  const a = (accept ?? '').toLowerCase();
  const estensioni = a
    .split(/[\s,]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  if (estensioni.some((e) => e.includes('xbrl') || e.includes('xml'))) {
    // Al campo XBRL vanno solo istanze XBRL: il prospetto Excel dello stesso
    // anno non è un file che il parser saprebbe leggere, e proporlo nella
    // schermata di acquisizione era un vicolo cieco.
    const istanze = DOCUMENTI_DEMO.filter((d) => d.formato === 'XBRL');
    return istanze.length > 0
      ? istanze
      : DOCUMENTI_DEMO.filter((d) => d.nome.startsWith('bilancio-'));
  }
  const pdf = estensioni.some((e) => e.includes('pdf'))
    ? DOCUMENTI_DEMO.filter((d) => d.formato === 'PDF')
    : [];
  const excel = estensioni.some(
    (e) => e.includes('xls') || e.includes('csv') || e.includes('ods') || e.includes('excel')
  )
    ? DOCUMENTI_DEMO.filter((d) => d.formato === 'EXCEL' && !d.nome.startsWith('bilancio-'))
    : [];
  const compatibili = [...pdf, ...excel];
  return compatibili.length > 0 ? compatibili : DOCUMENTI_DEMO;
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
 *
 * Se il ruolo richiesto non esiste per quell'azienda — per esempio un campo
 * «proposta» aperto su Tessitura, che nella demo segue la liquidazione — non
 * si apre un modale con zero file: si propongono i documenti disponibili,
 * così l'operatore vede il criterio e può correggerlo.
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
  const pertinenti = candidati.filter((d) => richiesti.has(d.ruolo));
  return pertinenti.length > 0 ? pertinenti : candidati;
}
