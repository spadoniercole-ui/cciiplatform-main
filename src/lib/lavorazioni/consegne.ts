// src/lib/lavorazioni/consegne.ts
//
// REGISTRO DELLE CONSEGNE AI REPARTI.
//
// Il documento per reparto si scarica dal browser e l'invio lo fa l'ufficio:
// la piattaforma non manda nulla. Restava però una domanda senza risposta —
// «questo reparto ha ricevuto il documento? quale versione? quando?» — e senza
// quella risposta una comunicazione consegnata e una mai inviata si
// assomigliano troppo.
//
// Qui c'è la parte pura: come si valida quello che il browser dichiara di
// avere scaricato, e come si riduce il registro all'ultima consegna per
// reparto. Il database e le guardie stanno nell'azione
// (src/app/actions/consegneReparti.ts), il disegno nella scheda del triage.
//
// COSA SI REGISTRA. Un evento per ogni scaricamento: reparto, data della
// verifica, versione del documento, numero di posizioni, totale, quante
// restano da contabilizzare, chi lo ha scaricato e quando. Il registro è un
// diario, non una tabella di stato: due scaricamenti sono due righe, perché
// due sono le volte in cui quel foglio è uscito dalla piattaforma.
//
// COSA NON SI REGISTRA. Nessun contenuto del PDF, nessun indirizzo del
// destinatario: il documento resta sul computer di chi lo scarica.
//
// LA CONFERMA D'INVIO. «Consegnato» vuol dire scaricato, e resta vero: la
// piattaforma non spedisce nulla e non può sapere da sola se il file è
// partito. Chi lo invia però può dichiararlo — data, mezzo e note — e allora
// la riga del registro smette di essere solo un'uscita e diventa un verbale:
// «spedito il 21/10 alle 15:42 via PEC». È una dichiarazione di chi la firma
// (l'utente in sessione), scritta una volta sola: una conferma sovrascritta
// non direbbe più chi ha detto cosa, e il registro servirebbe a poco. Senza
// conferma la riga resta muta, e a schermo si legge «invio non confermato»,
// non «non inviato»: l'una è un fatto registrato, l'altra una supposizione.

import { formattaImportoEuro } from './comunicazioni';
// Le consegne si contano per ufficio, non per come è stata scritta la sua dipendenza.
import { chiaveDipendenza } from './dipendenze';

/**
 * QUALE DEI DUE DOCUMENTI È USCITO.
 *
 * Il registro serve a rispondere a «l'ufficio ha in mano la versione che vedo
 * adesso?», e la risposta vale solo dentro lo stesso tipo di documento: le due
 * impronte (documento per reparto, report per unità operativa) si calcolano su
 * contenuti diversi e non sono confrontabili. Un destinatario che si chiama
 * «Ufficio contributi» in entrambi i ruoli non deve far risultare superato un
 * foglio che nessuno ha mai ricevuto.
 */
export type TipoDocumentoConsegnato = 'reparto' | 'dipendenza';

export interface ConsegnaRepartoInput {
  /** Il reparto o l'unità operativa a cui il documento è destinato. */
  reparto: string;
  /** Quale documento: `reparto` (per tipologia) o `dipendenza` (per codice). */
  tipo?: TipoDocumentoConsegnato;
  /** Data della verifica, AAAA-MM-GG. */
  dataVerifica: string;
  /** Impronta del contenuto, es. `1-3f9a1c2b`. */
  versione: string;
  nomeFile: string;
  righe: number;
  totale: number;
  posizioniDaContabilizzare: number;
  importoDaContabilizzare: number;
}

/**
 * I mezzi con cui il documento può lasciare l'ufficio.
 *
 * Un elenco chiuso e non testo libero: il registro deve poter dire «quanti
 * sono partiti per PEC» senza interpretare come ognuno ha scritto «pec»,
 * «posta elettronica» o «e-mail». `ALTRO` esiste per il mezzo che non si era
 * previsto, e le note dicono quale fosse.
 */
export const MEZZI_INVIO = [
  { valore: 'PEC', etichetta: 'PEC' },
  { valore: 'EMAIL', etichetta: 'Email' },
  { valore: 'PROTOCOLLO', etichetta: 'Protocollo interno' },
  { valore: 'A_MANO', etichetta: 'Consegna a mano' },
  { valore: 'POSTA', etichetta: 'Posta ordinaria' },
  { valore: 'ALTRO', etichetta: 'Altro mezzo' },
] as const;

export type MezzoInvio = (typeof MEZZI_INVIO)[number]['valore'];

/** L'etichetta da mostrare per un mezzo; un valore sconosciuto si legge com'è. */
export function etichettaMezzo(mezzo: string): string {
  return MEZZI_INVIO.find((m) => m.valore === mezzo)?.etichetta ?? mezzo;
}

/**
 * La dichiarazione di invio: quando il documento è partito, come, con quali
 * note, e chi lo ha dichiarato.
 *
 * `confermatoIl` e `confermatoDa` non li sceglie chi compila: sono l'istante
 * della scrittura e la sessione che l'ha fatta. Senza quei due campi la
 * dichiarazione non sarebbe attribuibile, e una dichiarazione non attribuita
 * non vale come prova che il documento è uscito.
 */
export interface InvioConfermato {
  /** Quando è stato spedito, AAAA-MM-GG — dichiarato da chi invia. */
  inviataIl: string;
  mezzo: MezzoInvio;
  note: string | null;
  /** Quando è stata registrata la conferma, ISO 8601. */
  confermatoIl: string;
  confermatoDa: string | null;
}

export interface ConsegnaRegistrata extends ConsegnaRepartoInput {
  id: number;
  /** Sempre valorizzato: le righe scritte prima di questa colonna sono `reparto`. */
  tipo: TipoDocumentoConsegnato;
  /** Quando è stato scaricato, ISO 8601. */
  consegnatoIl: string;
  /** Chi lo ha scaricato, se la sessione lo dice. */
  consegnatoDa: string | null;
  /**
   * La ragione sociale dell'azienda al momento della consegna.
   *
   * È una fotografia, non un riferimento: se l'anagrafica cambia nome — o
   * sparisce — la riga del registro continua a dire a quale azienda si
   * riferisce. Senza, un evento sopravvissuto all'azienda non sarebbe
   * leggibile.
   */
  ragioneSociale: string | null;
  /**
   * Quanti scaricamenti ha quel reparto, quando il registro li conta sul
   * database invece di restituire una riga per evento (vedi
   * `ottieniConsegneRepartiAction`).
   */
  scaricamenti?: number;
  /** La dichiarazione d'invio, se qualcuno l'ha fatta. */
  invio: InvioConfermato | null;
}

export interface RiepilogoConsegneReparto {
  reparto: string;
  /** I due tipi di documento restano distinti anche a parità di nome. */
  tipo: TipoDocumentoConsegnato;
  /** L'ultima consegna: quella che si presume in mano al reparto. */
  ultima: ConsegnaRegistrata;
  /** Quante volte il documento è uscito dalla piattaforma. */
  scaricamenti: number;
}

/**
 * Che cosa si può dire, accanto al PDF di un reparto, del documento che quel
 * reparto ha in mano.
 *
 *  - `mai`: nessuno scaricamento registrato;
 *  - `allineata`: l'ultima consegna è la versione che si sta guardando;
 *  - `superata`: è stata consegnata una versione precedente, e va riscaricata.
 */
export type StatoConsegnaReparto =
  | { stato: 'mai' }
  | { stato: 'allineata'; consegna: RiepilogoConsegneReparto }
  | { stato: 'superata'; consegna: RiepilogoConsegneReparto };

/** Confronta l'ultima consegna con la versione del documento attuale. */
export function statoConsegnaReparto(
  consegna: RiepilogoConsegneReparto | undefined,
  versioneCorrente: string
): StatoConsegnaReparto {
  if (!consegna) return { stato: 'mai' };
  return consegna.ultima.versione === versioneCorrente
    ? { stato: 'allineata', consegna }
    : { stato: 'superata', consegna };
}

/**
 * Perché la versione consegnata non è più quella corrente.
 *
 * «Riscarica il PDF» detto uguale per ogni reparto, senza dire che cosa è
 * cambiato, si legge come un errore della piattaforma: chi guarda la scheda
 * dopo aver corretto la data della verifica non sa che la causa è quella, e
 * rifà il giro otto volte pensando a un guasto. La causa si deduce dai pochi
 * dati che il registro conserva (data, numero di posizioni, totale); quando
 * nessuno di quei tre spiega il cambio, la differenza sta nelle tipologie o
 * nelle attività, ed è quello che si dice.
 */
export function causaSuperamento(
  consegna: ConsegnaRegistrata,
  documento: { dataVerifica: string; righe: number; totale: number }
): string {
  const cause: string[] = [];
  if (consegna.dataVerifica !== documento.dataVerifica) {
    cause.push('la data della verifica è cambiata');
  }
  if (consegna.righe !== documento.righe) {
    cause.push(`le posizioni elencate sono passate da ${consegna.righe} a ${documento.righe}`);
  } else if (Math.abs(consegna.totale - documento.totale) >= 0.005) {
    cause.push(
      `il totale è passato da ${formattaImportoEuro(consegna.totale)} a ${formattaImportoEuro(
        documento.totale
      )}`
    );
  }
  if (cause.length === 0) {
    cause.push('sono cambiate le tipologie o le attività da svolgere');
  }
  return cause.join('; ');
}

/**
 * La data della verifica in AAAA-MM-GG.
 *
 * Le query la chiedono già come testo (`to_char`): la colonna è DATE, e i due
 * driver la renderebbero come Date con fusi diversi — `pg` a mezzanotte locale,
 * PGlite a mezzanotte UTC — facendo scivolare il giorno di uno. Resta un ramo
 * difensivo per un valore Date, letto sui campi locali e non via toISOString(),
 * che in un fuso a est di UTC arretrerebbe di un giorno.
 */
function giornoDaValore(valore: unknown): string {
  if (valore instanceof Date) {
    if (Number.isNaN(valore.getTime())) return '';
    const mese = String(valore.getMonth() + 1).padStart(2, '0');
    const giorno = String(valore.getDate()).padStart(2, '0');
    return `${valore.getFullYear()}-${mese}-${giorno}`;
  }
  return String(valore ?? '').slice(0, 10);
}

function istanteDaValore(valore: unknown): string {
  if (valore == null || valore === '') return '';
  const d = valore instanceof Date ? valore : new Date(String(valore));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/**
 * La conferma d'invio di una riga, se c'è.
 *
 * Non basta che una colonna sia valorizzata: una riga con la data ma senza il
 * mezzo (o senza chi l'ha confermata) non è una dichiarazione completa, e
 * mezza dichiarazione è peggio di nessuna — direbbe «inviato» senza dire come.
 * In quel caso si legge come non confermata.
 */
function invioDaRiga(r: Record<string, unknown>): InvioConfermato | null {
  if (r.inviata_il == null || r.mezzo_invio == null) return null;
  const inviataIl = giornoDaValore(r.inviata_il);
  const mezzo = String(r.mezzo_invio);
  const confermatoIl = istanteDaValore(r.invio_confermato_il);
  if (!inviataIl || !mezzo || !confermatoIl) return null;
  const note = r.note_invio == null ? '' : String(r.note_invio).trim();
  return {
    inviataIl,
    mezzo: mezzo as MezzoInvio,
    note: note === '' ? null : note,
    confermatoIl,
    confermatoDa: r.invio_confermato_da == null ? null : String(r.invio_confermato_da),
  };
}

/**
 * La riga del database nella forma che il dominio conosce.
 *
 * Gli importi arrivano come stringhe (NUMERIC non è un numero per il driver) e
 * le date come Date: qui si traducono una volta sola, così né l'azione né la
 * scheda devono conoscere i tipi del database.
 */
export function consegnaDaRiga(r: Record<string, unknown>): ConsegnaRegistrata {
  const scaricamenti = r.scaricamenti == null ? undefined : Number(r.scaricamenti);
  return {
    id: Number(r.id),
    reparto: String(r.reparto ?? ''),
    tipo: r.tipo === 'dipendenza' ? 'dipendenza' : 'reparto',
    dataVerifica: giornoDaValore(r.data_verifica),
    versione: String(r.versione ?? ''),
    nomeFile: String(r.nome_file ?? ''),
    righe: Number(r.righe ?? 0),
    totale: Number(r.totale ?? 0),
    posizioniDaContabilizzare: Number(r.posizioni_da_contabilizzare ?? 0),
    importoDaContabilizzare: Number(r.importo_da_contabilizzare ?? 0),
    consegnatoIl: istanteDaValore(r.consegnato_il),
    consegnatoDa: r.consegnato_da == null ? null : String(r.consegnato_da),
    ragioneSociale:
      r.ragione_sociale == null || String(r.ragione_sociale).trim() === ''
        ? null
        : String(r.ragione_sociale),
    ...(scaricamenti !== undefined && Number.isFinite(scaricamenti)
      ? { scaricamenti: Number(scaricamenti) }
      : {}),
    invio: invioDaRiga(r),
  };
}

export type EsitoValidazioneConsegna =
  { ok: true; dati: ConsegnaRepartoInput } | { ok: false; errore: string };

const VERSIONE = /^\d+-[0-9a-f]{8}$/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data reale (il 31 febbraio non esiste), non solo scritta bene. */
function dataValida(iso: string): boolean {
  if (!DATA_ISO.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function importoValido(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e12;
}

/**
 * Valida e normalizza ciò che arriva dal browser prima di scriverlo.
 *
 * Il chiamante è autenticato e autorizzato altrove; qui si difende il registro
 * da dati che non potrebbero essere veri — una versione inventata, una data
 * che non esiste, un totale negativo — perché un registro con dentro una riga
 * impossibile non serve più a ricostruire niente.
 */
export function validaConsegna(input: unknown): EsitoValidazioneConsegna {
  if (!input || typeof input !== 'object') {
    return { ok: false, errore: 'Dati della consegna mancanti.' };
  }
  const i = input as Record<string, unknown>;

  const reparto = typeof i.reparto === 'string' ? i.reparto.trim().replace(/\s+/g, ' ') : '';
  if (!reparto) return { ok: false, errore: 'Indica il reparto della consegna.' };
  // Il tipo è facoltativo (il documento per reparto è il caso storico) ma non
  // libero: un valore fuori elenco confonderebbe i due registri.
  const tipoGrezzo = i.tipo == null ? 'reparto' : i.tipo;
  if (tipoGrezzo !== 'reparto' && tipoGrezzo !== 'dipendenza') {
    return { ok: false, errore: 'Tipo di documento non riconosciuto.' };
  }
  const tipo: TipoDocumentoConsegnato = tipoGrezzo;
  if (reparto.length > 160) {
    return { ok: false, errore: 'Il reparto non può superare 160 caratteri.' };
  }

  const dataVerifica = typeof i.dataVerifica === 'string' ? i.dataVerifica.trim() : '';
  if (!dataValida(dataVerifica)) {
    return { ok: false, errore: 'La data della verifica non è una data valida.' };
  }

  const versione = typeof i.versione === 'string' ? i.versione.trim() : '';
  if (!VERSIONE.test(versione)) {
    return { ok: false, errore: 'Versione del documento non riconosciuta.' };
  }

  const nomeFile = typeof i.nomeFile === 'string' ? i.nomeFile.trim() : '';
  if (!nomeFile || !nomeFile.toLowerCase().endsWith('.pdf')) {
    return { ok: false, errore: 'Nome del file non valido.' };
  }
  if (nomeFile.length > 255) {
    return { ok: false, errore: 'Il nome del file non può superare 255 caratteri.' };
  }

  const righe = i.righe;
  if (typeof righe !== 'number' || !Number.isInteger(righe) || righe < 0 || righe > 1_000_000) {
    return { ok: false, errore: 'Numero di posizioni non valido.' };
  }
  const posizioniDaContabilizzare = i.posizioniDaContabilizzare;
  if (
    typeof posizioniDaContabilizzare !== 'number' ||
    !Number.isInteger(posizioniDaContabilizzare) ||
    posizioniDaContabilizzare < 0 ||
    posizioniDaContabilizzare > righe
  ) {
    return { ok: false, errore: 'Numero di posizioni da contabilizzare non valido.' };
  }

  const totale = i.totale;
  if (!importoValido(totale)) return { ok: false, errore: 'Totale non valido.' };
  const importoDaContabilizzare = i.importoDaContabilizzare;
  if (!importoValido(importoDaContabilizzare)) {
    return { ok: false, errore: 'Importo da contabilizzare non valido.' };
  }
  if (importoDaContabilizzare > totale) {
    return { ok: false, errore: 'L’importo da contabilizzare non può superare il totale.' };
  }

  return {
    ok: true,
    dati: {
      reparto,
      tipo,
      dataVerifica,
      versione,
      nomeFile,
      righe,
      totale,
      posizioniDaContabilizzare,
      importoDaContabilizzare,
    },
  };
}

export type EsitoValidazioneInvio =
  | { ok: true; dati: { inviataIl: string; mezzo: MezzoInvio; note: string | null } }
  | { ok: false; errore: string };

/** L'anno sotto il quale una data d'invio non è credibile: prima non c'era il registro. */
const ANNO_MINIMO = 2000;
const NOTE_MAX = 500;

/**
 * Valida la dichiarazione d'invio che arriva dal browser.
 *
 * Tre campi e una regola che conta: **la data non può essere nel futuro**.
 * Dichiarare di avere spedito domani una cosa oggi non è un refuso innocuo —
 * toglierebbe al registro l'unica cosa che sa dire, cioè quando. Si tollera un
 * giorno oltre oggi perché il fuso del server non è quello di chi compila: con
 * il fuso a ovest, un invio fatto stasera arriverebbe al server con la data di
 * domani, e rifiutarlo sarebbe un errore nostro.
 *
 * Il mezzo deve essere uno di quelli previsti: l'elenco chiuso serve a contare,
 * e un valore fuori elenco vorrebbe dire una tendina manomessa.
 */
export function validaConfermaInvio(
  input: unknown,
  oggi: Date = new Date()
): EsitoValidazioneInvio {
  if (!input || typeof input !== 'object') {
    return { ok: false, errore: 'Dati della conferma mancanti.' };
  }
  const i = input as Record<string, unknown>;

  const inviataIl = typeof i.inviataIl === 'string' ? i.inviataIl.trim() : '';
  if (!dataValida(inviataIl)) {
    return { ok: false, errore: 'La data di invio non è una data valida.' };
  }
  if (Number(inviataIl.slice(0, 4)) < ANNO_MINIMO) {
    return { ok: false, errore: 'La data di invio è troppo indietro nel tempo.' };
  }
  const domani = new Date(oggi.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (inviataIl > domani) {
    return { ok: false, errore: 'La data di invio non può essere nel futuro.' };
  }

  const mezzo = typeof i.mezzo === 'string' ? i.mezzo.trim() : '';
  if (!MEZZI_INVIO.some((m) => m.valore === mezzo)) {
    return { ok: false, errore: 'Indica con quale mezzo hai inviato il documento.' };
  }

  // Le note sono facoltative: vuote valgono «nessuna nota», non un errore.
  const noteGrezze = i.note == null ? '' : i.note;
  if (typeof noteGrezze !== 'string') {
    return { ok: false, errore: 'Le note dell’invio non sono valide.' };
  }
  const note = noteGrezze.trim();
  if (note.length > NOTE_MAX) {
    return { ok: false, errore: `Le note non possono superare ${NOTE_MAX} caratteri.` };
  }

  return {
    ok: true,
    dati: { inviataIl, mezzo: mezzo as MezzoInvio, note: note === '' ? null : note },
  };
}

function istante(c: ConsegnaRegistrata): number {
  const t = Date.parse(c.consegnatoIl);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Il registro ridotto a una riga per reparto: l'ultima consegna e quante volte
 * il documento è stato scaricato.
 *
 * Il raggruppamento è per nome del reparto senza maiuscole: «Ufficio
 * contributi» e «ufficio contributi» sono lo stesso ufficio, e due righe
 * distinte farebbero credere a due destinatari. A parità di istante vince
 * l'id più alto — l'ordine di inserimento, quando il timestamp ha la stessa
 * precisione.
 */
export function riassumiConsegne(righe: ConsegnaRegistrata[]): RiepilogoConsegneReparto[] {
  const perReparto = new Map<
    string,
    { reparto: string; tipo: TipoDocumentoConsegnato; ultima: ConsegnaRegistrata }
  >();
  // Due sorgenti di conteggio, che non vanno sommate due volte. `espliciti` è
  // il numero che il database ha già calcolato (lettura aggregata: una riga per
  // reparto). `locali` sono le righe senza conteggio: gli scaricamenti appena
  // fatti, che il database non ha ancora visto perché la scheda non rilegge il
  // registro. Il totale è la somma delle due, che nel caso normale (elenco di
  // eventi, nessun conteggio esplicito) torna il numero di righe.
  const espliciti = new Map<string, number>();
  const locali = new Map<string, number>();

  for (const c of righe) {
    // La chiave dell'ufficio, non la sua grafia: la stessa consegna registrata
    // quando il destinatario si chiamava «Presidio flussi» e la successiva
    // quando si chiamava «PRESIDIO FLUSSI» sono consegne dello stesso ufficio.
    const nome = chiaveDipendenza(c.reparto);
    if (!nome) continue;
    // La chiave porta il tipo: stesso nome, due documenti diversi.
    const tipo: TipoDocumentoConsegnato = c.tipo ?? 'reparto';
    const chiave = `${tipo}|${nome}`;
    if (c.scaricamenti === undefined) {
      locali.set(chiave, (locali.get(chiave) ?? 0) + 1);
    } else {
      espliciti.set(chiave, Math.max(espliciti.get(chiave) ?? 0, c.scaricamenti));
    }

    const esistente = perReparto.get(chiave);
    if (!esistente) {
      perReparto.set(chiave, { reparto: c.reparto.trim(), tipo, ultima: c });
      continue;
    }
    const piuRecente =
      istante(c) > istante(esistente.ultima) ||
      (istante(c) === istante(esistente.ultima) && c.id > esistente.ultima.id);
    if (piuRecente) {
      esistente.reparto = c.reparto.trim();
      esistente.ultima = c;
    }
  }

  return Array.from(perReparto.entries())
    .map(([chiave, v]) => ({
      reparto: v.reparto,
      tipo: v.tipo,
      ultima: v.ultima,
      scaricamenti: (espliciti.get(chiave) ?? 0) + (locali.get(chiave) ?? 0),
    }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.reparto.localeCompare(b.reparto, 'it-IT'));
}
