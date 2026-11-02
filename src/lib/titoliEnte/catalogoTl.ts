// src/lib/titoliEnte/catalogoTl.ts
//
// IL CATALOGO DELLE TS — codice, descrizione, flag per la check list (0.159.0).
//
// Lo schema è questo, e non un altro: una TS è un codice, una descrizione e un
// contrassegno. Nient'altro. L'ufficio, i passi e l'esito non stanno qui: sono
// il processo con cui una materia lavora quella TS su una direttrice e un
// prodotto, e vivono nell'associazione (`materia_tl`). I titoli di credito
// mettono insieme TS, direttrice e prodotto e costruiscono la vestizione
// legale — atto, presupposto, riferimento interno.
//
// Prima la TS era scritta dentro il prodotto: la stessa TS 81 compariva tante
// volte quanti erano i prodotti che la usavano, e ogni copia portava con sé
// ufficio, passi ed esito. Il risultato era che la stessa lavorazione andava
// corretta in quattro punti, e che il prodotto sembrava definire la TS invece
// di essere il fatto su cui la materia la applica.
//
// Logica pura: tipi, validazione, normalizzazione. Nessun accesso al database.

/** Il verso della TS nella check di perimetro del triage. */
export type VersoCheckList = 'COLLABORATIVA' | 'RESISTENZA';

/** Il codice è breve e parlante: «81», «TS-81», «CISOA». */
export const MASSIMO_CARATTERI_CODICE_TL = 24;

/** La descrizione è il nome della lavorazione: «Diffida M400». */
export const MASSIMO_CARATTERI_DESCRIZIONE_TL = 200;

/** Una TS del catalogo: codice, descrizione, contrassegno per la check list. */
export interface Tl {
  id: number;
  codice: string;
  descrizione: string;
  /** La TS entra nella check obbligatoria del triage. */
  checkList: boolean;
  /** Obbligatorio quando `checkList` è vero. */
  versoCheckList: VersoCheckList | null;
  ordine: number;
  /** Quante associazioni (materie) la usano: 0 = nessun codice la sta lavorando. */
  materie: number;
}

export interface InputTl {
  id?: number | null;
  codice: string;
  descrizione: string;
  checkList?: boolean;
  versoCheckList?: VersoCheckList | null;
}

/** Testo su una riga sola, senza bordi. */
export function unaRiga(testo: string | null | undefined): string {
  return (testo ?? '').replace(/\s+/g, ' ').trim();
}

/** La chiave del codice: maiuscole e spazi non contano. */
export function chiaveTl(codice: string | null | undefined): string {
  return unaRiga(codice).toLowerCase();
}

/**
 * ERRORE DA MOSTRARE, oppure null.
 *
 * Il codice e la descrizione sono obbligatori perché sono l'identità della TS:
 * senza codice non si cita in un documento, senza descrizione non si sa che
 * cosa si sta lavorando. Il verso è obbligatorio col contrassegno, come nella
 * check del triage: senza, la sintesi non sa dire da che parte sta la TS.
 */
export function validaTl(input: InputTl): string | null {
  const codice = unaRiga(input.codice);
  if (!codice) return 'Indica il codice della TS.';
  if (codice.length > MASSIMO_CARATTERI_CODICE_TL)
    return `Il codice della TS non può superare ${MASSIMO_CARATTERI_CODICE_TL} caratteri.`;
  const descrizione = unaRiga(input.descrizione);
  if (!descrizione) return 'Indica la descrizione della TS: è il nome della lavorazione.';
  if (descrizione.length > MASSIMO_CARATTERI_DESCRIZIONE_TL)
    return `La descrizione non può superare ${MASSIMO_CARATTERI_DESCRIZIONE_TL} caratteri.`;
  if (input.checkList === true && !input.versoCheckList)
    return 'Se la TS entra nella check list, indica se è collaborativa o di resistenza.';
  return null;
}

export function normalizzaTl(input: InputTl): InputTl {
  const checkList = input.checkList === true;
  return {
    id: input.id ?? null,
    codice: unaRiga(input.codice),
    descrizione: unaRiga(input.descrizione),
    checkList,
    versoCheckList: checkList && input.versoCheckList ? input.versoCheckList : null,
  };
}

/** Una riga del database nella forma del catalogo. */
export function rigaTl(r: Record<string, unknown>): Tl {
  return {
    id: Number(r.id),
    codice: String(r.codice ?? ''),
    descrizione: String(r.descrizione ?? ''),
    checkList: r.check_list === true,
    versoCheckList:
      r.verso_check_list === 'COLLABORATIVA' || r.verso_check_list === 'RESISTENZA'
        ? r.verso_check_list
        : null,
    ordine: Number(r.ordine ?? 0),
    materie: Number(r.materie ?? 0),
  };
}

/** L'etichetta con cui una TS si legge in un elenco o in un documento. */
export function etichettaTl(tl: Pick<Tl, 'codice' | 'descrizione'>): string {
  const codice = unaRiga(tl.codice);
  const descrizione = unaRiga(tl.descrizione);
  if (codice && descrizione) return `${codice} — ${descrizione}`;
  return descrizione || codice;
}
