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
// Logica pura, con i suoi test. La tabella e le azioni stanno altrove.

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
}

export interface Decisione extends BozzaDecisione {
  id: number;
  decisaIl: string;
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
  if (!sessione) return null;
  const nome = (sessione.username ?? sessione.email ?? '').trim();
  return nome.length > 0 ? nome : null;
}

export function etichettaEsito(codice: string): string {
  return ESITI_DECISIONE.find((e) => e.codice === codice)?.etichetta ?? codice;
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

/** Il riassunto di una decisione in una riga, per l'elenco. */
export function riassuntoDecisione(d: Decisione): string {
  const credito =
    d.credito === null ? '' : ` · credito ${Math.round(d.credito).toLocaleString('it-IT')} €`;
  const copertura = d.copertura ? ` · copertura ${d.copertura}` : '';
  return `${etichettaEsito(d.esito)} — ${d.autore}${credito}${copertura}`;
}
