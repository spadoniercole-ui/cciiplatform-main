// LA DECISIONE LASCIA UNA TRACCIA (0.242.0).
//
// Nessun esito della catena è memorizzato: si ricalcola sempre, ed è giusto,
// perché un giudizio salvato divergerebbe dai dati. Ma ricalcolare non è
// ricordare: fra sei mesi nessuno può dire chi ha guardato questa posizione,
// quando, con quale copertura e con quale motivazione — e un ente che decide
// deve poterlo dire.
//
// Qui non si congela il giudizio: si registra l'ATTO. La motivazione è
// obbligatoria perché una decisione senza motivo è un colore senza nome; la
// copertura e il credito si annotano perché fra sei mesi i numeri saranno
// diversi, e senza quelli la decisione sarebbe illeggibile.
//
// La traccia si legge anche quando l'utente non c'è più (0.243.0): l'id resta
// e `autoreAttivo` dice se la riga utente esiste ancora, così un firmatario
// disattivato non sparisce e non viene scambiato per un utente corrente.
//
// Logica pura, con i suoi test. La tabella e le azioni stanno altrove.

import { formattaEuro, soloGiorno } from '@/lib/formato/numeri';
import { nomeDaSessione } from '@/lib/identitaSessione';

export const ESITI_DECISIONE = [
  { codice: 'PROSEGUI', etichetta: 'Proseguire' },
  { codice: 'CHIEDI_DOCUMENTI', etichetta: 'Chiedere documenti' },
  { codice: 'RIMANDA', etichetta: 'Rimandare' },
  { codice: 'ARCHIVIA', etichetta: 'Archiviare' },
] as const;

export type EsitoDecisione = (typeof ESITI_DECISIONE)[number]['codice'];

export const MOTIVAZIONE_MINIMA = 20;

/** Da quale tipo di utente arriva la firma: l'id da solo sarebbe ambiguo. */
export type ModalitaAutore = 'ADMIN_SPAZIO' | 'OPERATORE' | 'SALVAGENTE';

/** Il grado della posizione al momento dell'atto. */
export type GradoPosizione = 'PRONTA' | 'QUASI' | 'BLOCCATA';

export interface BozzaDecisione {
  esito: EsitoDecisione;
  motivazione: string;
  autore: string;
  /**
   * L'id dell'utente dello spazio che firma (`admin_workspace` o
   * `utenti_spazio`, secondo `autoreModalita`). Null solo per il Superadmin in
   * salvagente, che non ha una riga utente nello spazio.
   */
  autoreId: number | null;
  /** Null per le righe scritte prima della 0.242.4, che l'id non lo avevano. */
  autoreModalita: ModalitaAutore | null;
  /** Il credito vantato al momento della decisione. */
  credito: number | null;
  /** La copertura dell'indicatore al momento della decisione, es. «4/4». */
  copertura: string | null;
  /**
   * Il grado e i blocchi della posizione al momento della firma (0.244.0).
   * Sono annotati dal server, non dal browser: la riga dice su che cosa si è
   * deciso, non che cosa il modulo credeva.
   */
  statoGrado?: GradoPosizione | null;
  statoBlocchi?: number | null;
}

export interface Decisione extends BozzaDecisione {
  id: number;
  decisaIl: string;
  /**
   * La riga utente che ha firmato esiste ancora ed è attiva? null per le
   * decisioni senza id (salvagente, righe anteriori alla 0.242.4).
   */
  autoreAttivo: boolean | null;
}

export interface ValidazioneDecisione {
  valida: boolean;
  errore: string | null;
}

export const ESITI_DECISIONE_CODICI: EsitoDecisione[] = ESITI_DECISIONE.map((e) => e.codice);

/**
 * Chi firma la decisione: l'identità della sessione, non un campo del browser
 * (0.242.3). Un nome scritto a mano in una casella può essere quello di un
 * altro, e una traccia che si può compilare con un nome falso non è una
 * traccia. Resta null solo se la sessione non porta alcun nome: in quel caso
 * l'azione rifiuta, invece di inventarne uno.
 */
export function autoreDaSessione(
  sessione: { username: string | null; email: string | null } | null | undefined
): string | null {
  return nomeDaSessione(sessione);
}

export function etichettaEsito(codice: string): string {
  return ESITI_DECISIONE.find((e) => e.codice === codice)?.etichetta ?? codice;
}

/**
 * Chi ha firmato, in una riga leggibile: «utente #12», «utente #12 · non più
 * attivo», «sessione Superadmin» o «senza id utente». L'etichetta non dice
 * solo un numero: dice se quella riga utente esiste ancora.
 */
export function etichettaAutore(
  d: Pick<Decisione, 'autoreId' | 'autoreModalita' | 'autoreAttivo'>
): string {
  if (d.autoreId === null || d.autoreId === undefined) {
    return d.autoreModalita === 'SALVAGENTE' ? 'sessione Superadmin' : 'senza id utente';
  }
  return d.autoreAttivo === false
    ? `utente #${d.autoreId} · non più attivo`
    : `utente #${d.autoreId}`;
}

/**
 * Una decisione si registra solo se dice che cosa si fa e perché. La soglia
 * sulla motivazione è una convenzione di lavoro: sotto le venti lettere non
 * c'è un motivo, c'è un «ok».
 */
export function validaDecisione(
  bozza: Partial<BozzaDecisione> | null | undefined
): ValidazioneDecisione {
  if (!bozza) return { valida: false, errore: 'Nessuna decisione da registrare.' };

  if (!bozza.esito || !ESITI_DECISIONE_CODICI.includes(bozza.esito)) {
    return { valida: false, errore: 'Scegliere che cosa si fa: l’esito non è riconosciuto.' };
  }

  const motivazione = (bozza.motivazione ?? '').trim();
  if (motivazione.length < MOTIVAZIONE_MINIMA) {
    return {
      valida: false,
      errore: `La motivazione è troppo breve: servono almeno ${MOTIVAZIONE_MINIMA} caratteri, perché la decisione resti leggibile fra sei mesi.`,
    };
  }

  if (!(bozza.autore ?? '').trim()) {
    return {
      valida: false,
      errore: 'Manca chi decide: la traccia senza autore non è una traccia.',
    };
  }

  if (
    bozza.autoreId !== null &&
    bozza.autoreId !== undefined &&
    (!Number.isInteger(bozza.autoreId) || bozza.autoreId <= 0)
  ) {
    return { valida: false, errore: 'L’id dell’utente che firma non è valido.' };
  }

  if (
    bozza.credito !== null &&
    bozza.credito !== undefined &&
    (!Number.isFinite(bozza.credito) || bozza.credito < 0)
  ) {
    return { valida: false, errore: 'Il credito annotato non è un importo valido.' };
  }

  return { valida: true, errore: null };
}

/**
 * LA DECISIONE DEVE STARE IN PIEDI CON LA POSIZIONE (0.244.0).
 *
 * Il modulo accettava «Proseguire» anche su una posizione bloccata: la traccia
 * avrebbe registrato un atto che i numeri smentiscono. Non è una questione di
 * forma — chi rilegge la posizione fra sei mesi vede un blocco e una decisione
 * che lo ignora, senza sapere quale credere. Gli altri esiti restano sempre
 * possibili: chiedere documenti, rimandare, archiviare sono modi legittimi di
 * decidere anche quando la posizione è ferma.
 */
export function validaCoerenzaDecisione(
  esito: EsitoDecisione | undefined,
  stato: { grado: GradoPosizione; blocchi: string[] }
): ValidazioneDecisione {
  if (!esito) return { valida: true, errore: null };
  if (stato.grado === 'BLOCCATA' && esito === 'PROSEGUI') {
    const primo = stato.blocchi[0] ? ` Primo blocco: ${stato.blocchi[0]}` : '';
    return {
      valida: false,
      errore: `La posizione è bloccata: non si può proseguire finché i blocchi restano. Risolvili, oppure rimanda o archivia con il motivo.${primo}`,
    };
  }
  return { valida: true, errore: null };
}

/** Il riassunto di una decisione in una riga, per l'elenco. */
export function riassuntoDecisione(d: Decisione): string {
  const credito = d.credito === null ? '' : ` · credito ${formattaEuro(d.credito)}`;
  const copertura = d.copertura ? ` · copertura ${d.copertura}` : '';
  return `${etichettaEsito(d.esito)} — ${d.autore}${credito}${copertura}`;
}

export interface FiltriDecisioni {
  /** Ricerca libera su autore, motivazione ed esito. */
  testo?: string;
  esito?: EsitoDecisione | '';
  /** AAAA-MM-GG, estremi inclusi. */
  dal?: string;
  al?: string;
}

const giornoValido = (v: string | undefined): string | null =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/**
 * La traccia si cerca, non solo si scorre (0.243.0): filtrare per persona,
 * esito e periodo è ciò che serve a un ente che deve mostrare «tutte le
 * decisioni di giugno». Filtro puro, così la regola si prova senza montare la
 * schermata; l'ordine della traccia resta quello ricevuto.
 */
export function filtraDecisioni(decisioni: Decisione[], filtri: FiltriDecisioni = {}): Decisione[] {
  const testo = (filtri.testo ?? '').trim().toLowerCase();
  const dal = giornoValido(filtri.dal);
  const al = giornoValido(filtri.al);

  return decisioni.filter((d) => {
    if (filtri.esito && d.esito !== filtri.esito) return false;

    const giorno = soloGiorno(d.decisaIl) ?? d.decisaIl.slice(0, 10);
    if (dal && giorno < dal) return false;
    if (al && giorno > al) return false;

    if (testo) {
      const paglia = `${d.autore} ${d.motivazione} ${etichettaEsito(d.esito)}`.toLowerCase();
      if (!paglia.includes(testo)) return false;
    }
    return true;
  });
}
