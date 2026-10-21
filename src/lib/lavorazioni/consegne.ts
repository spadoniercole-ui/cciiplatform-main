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
// COSA NON SI REGISTRA. Nessun contenuto del PDF, nessun indirizzo, nessuna
// conferma d'invio: la piattaforma non sa (e non deve sapere) se l'ufficio ha
// poi spedito davvero il file. «Consegnato» qui vuol dire «scaricato», ed è
// scritto così anche a schermo.

export interface ConsegnaRepartoInput {
  /** Il reparto a cui il documento è destinato. */
  reparto: string;
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

export interface ConsegnaRegistrata extends ConsegnaRepartoInput {
  id: number;
  /** Quando è stato scaricato, ISO 8601. */
  consegnatoIl: string;
  /** Chi lo ha scaricato, se la sessione lo dice. */
  consegnatoDa: string | null;
}

export interface RiepilogoConsegneReparto {
  reparto: string;
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
  const d = valore instanceof Date ? valore : new Date(String(valore ?? ''));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/**
 * La riga del database nella forma che il dominio conosce.
 *
 * Gli importi arrivano come stringhe (NUMERIC non è un numero per il driver) e
 * le date come Date: qui si traducono una volta sola, così né l'azione né la
 * scheda devono conoscere i tipi del database.
 */
export function consegnaDaRiga(r: Record<string, unknown>): ConsegnaRegistrata {
  return {
    id: Number(r.id),
    reparto: String(r.reparto ?? ''),
    dataVerifica: giornoDaValore(r.data_verifica),
    versione: String(r.versione ?? ''),
    nomeFile: String(r.nome_file ?? ''),
    righe: Number(r.righe ?? 0),
    totale: Number(r.totale ?? 0),
    posizioniDaContabilizzare: Number(r.posizioni_da_contabilizzare ?? 0),
    importoDaContabilizzare: Number(r.importo_da_contabilizzare ?? 0),
    consegnatoIl: istanteDaValore(r.consegnato_il),
    consegnatoDa: r.consegnato_da == null ? null : String(r.consegnato_da),
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
  const perReparto = new Map<string, RiepilogoConsegneReparto>();

  for (const c of righe) {
    const chiave = c.reparto.trim().toLocaleLowerCase('it-IT');
    if (!chiave) continue;
    const esistente = perReparto.get(chiave);
    if (!esistente) {
      perReparto.set(chiave, { reparto: c.reparto.trim(), ultima: c, scaricamenti: 1 });
      continue;
    }
    esistente.scaricamenti += 1;
    const piuRecente =
      istante(c) > istante(esistente.ultima) ||
      (istante(c) === istante(esistente.ultima) && c.id > esistente.ultima.id);
    if (piuRecente) {
      esistente.reparto = c.reparto.trim();
      esistente.ultima = c;
    }
  }

  return Array.from(perReparto.values()).sort((a, b) =>
    a.reparto.localeCompare(b.reparto, 'it-IT')
  );
}
