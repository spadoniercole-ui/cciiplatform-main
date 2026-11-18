// src/lib/file/corpoLimitato.ts
//
// LEGGERE IL CORPO DI UNA RICHIESTA CON UN TETTO, SENZA FIDARSI DI
// `Content-Length` (0.245.0).
//
// Le route che ricevono un file (upload dei documenti, analisi XBRL) devono
// fermare un corpo troppo grande PRIMA di tenerlo in memoria: una route non ha
// il limite delle server action. La prima versione di quella guardia leggeva
// `Content-Length` e rifiutava con 413 quando l'intestazione mancava. Sembrava
// prudente, ed era sbagliato: l'intestazione può mancare in una richiesta
// legittima, perché un corpo si può trasmettere a pezzi (`Transfer-Encoding:
// chunked`) e un proxy può ricomporlo senza dichiararne la lunghezza. È il caso
// dell'anteprima cloud di questa piattaforma: ogni upload dal browser arrivava
// senza `Content-Length` e veniva respinto, mentre lo stesso file caricato
// contro il server in locale passava.
//
// Qui il tetto si applica al contenuto che si legge davvero: se l'intestazione
// c'è e dichiara troppo si rifiuta subito (senza leggere nulla), altrimenti si
// legge a blocchi e ci si ferma appena il totale supera il limite. Il corpo
// letto viene poi dato a `formDataDalCorpo`, che ricostruisce il multipart con
// il suo `Content-Type` originale.

/** Il corpo supera il tetto dichiarato dal chiamante. */
export class CorpoTroppoGrande extends Error {
  readonly limiteByte: number;

  constructor(limiteByte: number) {
    super(`Il corpo della richiesta supera il limite di ${limiteByte} byte.`);
    this.name = 'CorpoTroppoGrande';
    this.limiteByte = limiteByte;
  }
}

/**
 * Il corpo della richiesta in un solo `Uint8Array`, oppure `CorpoTroppoGrande`.
 *
 * `limiteByte` è il tetto sul corpo intero (involucro multipart compreso):
 * chi chiama passa il limite del file più un margine per i confini del
 * multipart. Un corpo vuoto restituisce un array vuoto: chi chiama decide se è
 * un errore.
 */
export async function leggiCorpoLimitato(
  request: Request,
  limiteByte: number
): Promise<Uint8Array> {
  // Il `Content-Length`, quando c'è, è un'informazione in più: se dichiara un
  // corpo oltre il tetto non serve leggerlo.
  const dichiarata = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(dichiarata) && dichiarata > limiteByte) {
    throw new CorpoTroppoGrande(limiteByte);
  }

  const corpo = request.body;
  if (!corpo) return new Uint8Array(0);

  const lettore = corpo.getReader();
  const parti: Uint8Array[] = [];
  let totale = 0;
  try {
    for (;;) {
      const { done, value } = await lettore.read();
      if (done) break;
      if (!value) continue;
      totale += value.byteLength;
      if (totale > limiteByte) {
        // Si smette di leggere subito: non si attende il resto di un corpo che
        // comunque non si userà.
        await lettore.cancel().catch(() => undefined);
        throw new CorpoTroppoGrande(limiteByte);
      }
      parti.push(value);
    }
  } finally {
    lettore.releaseLock();
  }

  const unito = new Uint8Array(totale);
  let offset = 0;
  for (const parte of parti) {
    unito.set(parte, offset);
    offset += parte.byteLength;
  }
  return unito;
}

/**
 * Il multipart di un corpo già letto, con il suo `Content-Type` (che porta il
 * confine tra le parti). Serve perché `request.formData()` consuma lo stream:
 * dopo `leggiCorpoLimitato` lo stream è letto, e il multipart va ricostruito
 * dai byte.
 */
export async function formDataDalCorpo(
  corpo: Uint8Array,
  tipoContenuto: string | null
): Promise<FormData> {
  const intestazioni = new Headers();
  if (tipoContenuto) intestazioni.set('content-type', tipoContenuto);
  // `ArrayBuffer` è la forma che `BodyInit` accetta fra i tipi binari: passare
  // direttamente la vista `Uint8Array` non è tipato come corpo valido.
  const binario = corpo.slice().buffer as ArrayBuffer;
  return new Response(binario, { headers: intestazioni }).formData();
}
