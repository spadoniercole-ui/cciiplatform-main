// src/lib/titoliEnte/catalogoTl.ts
//
// IL CATALOGO DELLE TS — codice, descrizione, prodotti a cui appartiene (0.159.0 → 0.166.0).
//
// Lo schema è questo, e non un altro: una TS è un codice, una descrizione e
// l'elenco dei prodotti che la usano. L'ufficio, i passi e l'esito non stanno
// qui: sono il processo con cui una materia lavora quella TS su una direttrice
// e un prodotto (`materia_tl`). I titoli di credito mettono insieme TS,
// direttrice e prodotto e costruiscono la vestizione legale — atto, presupposto,
// riferimento interno.
//
// UNA TS, PIÙ PRODOTTI (0.166.0). L'associazione è tanti a tanti: la stessa
// lavorazione serve più prodotti — la diffida come passo della sollecitazione e
// come passo della mora — e finché il prodotto era una colonna sola la seconda
// associazione non si poteva scrivere: il codice risultava già usato e la TS
// andava duplicata, tornando al problema che il catalogo piatto aveva risolto.
//
// IL CODICE È UNICO DENTRO IL PRODOTTO (0.167.0), non nello spazio. Nei
// documenti la numerazione delle TS riparte per prodotto: la 81 di «Diffida
// M400» e la 81 di «Diffida sgravi contributivi» sono due lavorazioni, con la
// loro descrizione e il loro processo. Il doppione che resta vietato è quello
// vero: due TS con lo stesso codice sullo stesso prodotto, che sarebbero la
// stessa lavorazione scritta due volte. Le TS senza prodotto non hanno un posto
// in cui distinguersi, e valgono una sola per codice.
//
// Prima la TS era scritta dentro il prodotto: la stessa TS 81 compariva tante
// volte quanti erano i prodotti che la usava, e ogni copia portava con sé
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

/**
 * Un prodotto a cui la TS appartiene, con la sua direttrice. La coppia è
 * l'identità dell'associazione: il prodotto da solo non basta, perché lo stesso
 * nome può esistere sotto due uffici.
 */
export interface ProdottoTl {
  direttrice: string;
  prodotto: string;
}

/** Una TS del catalogo: codice, descrizione, prodotti, contrassegno per la check list. */
export interface Tl {
  id: number;
  codice: string;
  descrizione: string;
  /** La TS entra nella check obbligatoria del triage. */
  checkList: boolean;
  /**
   * I prodotti che la usano (0.166.0). Può essere vuoto: le TS scritte prima
   * di questa associazione restano valide finché qualcuno non dice dove stanno.
   */
  prodotti: ProdottoTl[];
  /**
   * La prima associazione, per le letture che ne mostrano una sola (il
   * processo operativo dice su quale prodotto la TS è «nata»). È una copia di
   * `prodotti[0]`, non un secondo dato da tenere allineato a mano.
   */
  direttrice?: string | null;
  prodotto?: string | null;
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
  /** I prodotti scelti: quanti se ne vogliono, anche nessuno. */
  prodotti?: ProdottoTl[];
  /** La coppia singola resta accettata: chi manda una sola associazione. */
  direttrice?: string | null;
  prodotto?: string | null;
}

/** Testo su una riga sola, senza bordi. */
export function unaRiga(testo: string | null | undefined): string {
  return (testo ?? '').replace(/\s+/g, ' ').trim();
}

/** La chiave del codice: maiuscole e spazi non contano. */
export function chiaveTl(codice: string | null | undefined): string {
  return unaRiga(codice).toLowerCase();
}

/** La chiave dell'associazione: la coppia direttrice/prodotto, senza grafia. */
export function chiaveProdottoTl(
  direttrice: string | null | undefined,
  prodotto: string | null | undefined
): string {
  return `${unaRiga(direttrice).toLowerCase()}|${unaRiga(prodotto).toLowerCase()}`;
}

/**
 * Le associazioni richieste, comunque siano arrivate. Chi manda solo la coppia
 * singola — una schermata vecchia, un backup — non resta senza prodotto.
 */
export function prodottiDelInput(input: InputTl): ProdottoTl[] {
  const elenco = Array.isArray(input.prodotti) ? input.prodotti : [];
  if (elenco.length > 0) return elenco;
  const prodotto = unaRiga(input.prodotto ?? '');
  return prodotto ? [{ direttrice: unaRiga(input.direttrice ?? ''), prodotto }] : [];
}

/**
 * ERRORE DA MOSTRARE, oppure null.
 *
 * Il codice e la descrizione sono obbligatori perché sono l'identità della TS:
 * senza codice non si cita in un documento, senza descrizione non si sa che
 * cosa si sta lavorando. Il verso è obbligatorio col contrassegno, come nella
 * check del triage: senza, la sintesi non sa dire da che parte sta la TS.
 *
 * Ogni associazione porta la sua direttrice — è ciò che collega il codice
 * all'ufficio — e la stessa coppia non può comparire due volte: sarebbe la
 * stessa associazione scritta in due righe.
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
  const prodotti = prodottiDelInput(input);
  if (prodotti.some((p) => !unaRiga(p.prodotto)))
    return 'Scegli il prodotto: un’associazione senza prodotto non dice dove si lavora.';
  if (prodotti.some((p) => !unaRiga(p.direttrice)))
    return 'Scegli la direttrice del prodotto a cui appartiene questa TS.';
  const viste = new Set<string>();
  for (const p of prodotti) {
    const chiave = chiaveProdottoTl(p.direttrice, p.prodotto);
    if (viste.has(chiave)) return 'Lo stesso prodotto è associato due volte a questa TS.';
    viste.add(chiave);
  }
  return null;
}

export function normalizzaTl(input: InputTl): InputTl {
  const checkList = input.checkList === true;
  const viste = new Set<string>();
  const prodotti: ProdottoTl[] = [];
  for (const p of prodottiDelInput(input)) {
    const direttrice = unaRiga(p.direttrice);
    const prodotto = unaRiga(p.prodotto);
    if (!prodotto) continue;
    const chiave = chiaveProdottoTl(direttrice, prodotto);
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    prodotti.push({ direttrice, prodotto });
  }
  const primo = prodotti[0] ?? null;
  return {
    id: input.id ?? null,
    codice: unaRiga(input.codice),
    descrizione: unaRiga(input.descrizione),
    checkList,
    versoCheckList: checkList && input.versoCheckList ? input.versoCheckList : null,
    prodotti,
    direttrice: primo?.direttrice ?? null,
    prodotto: primo?.prodotto ?? null,
  };
}

/**
 * Le associazioni della riga: dal jsonb `prodotti`, altrimenti — per gli spazi
 * non ancora migrati o per un backup vecchio — dalla coppia singola.
 */
function prodottiDaRiga(r: Record<string, unknown>): ProdottoTl[] {
  let elenco: unknown[] = [];
  if (Array.isArray(r.prodotti)) elenco = r.prodotti;
  else if (typeof r.prodotti === 'string' && r.prodotti.trim()) {
    try {
      const letto: unknown = JSON.parse(r.prodotti);
      if (Array.isArray(letto)) elenco = letto;
    } catch {
      elenco = [];
    }
  }
  const prodotti: ProdottoTl[] = [];
  const viste = new Set<string>();
  for (const voce of elenco) {
    if (!voce || typeof voce !== 'object') continue;
    const v = voce as Record<string, unknown>;
    const prodotto = unaRiga(typeof v.prodotto === 'string' ? v.prodotto : '');
    if (!prodotto) continue;
    const direttrice = unaRiga(typeof v.direttrice === 'string' ? v.direttrice : '');
    const chiave = chiaveProdottoTl(direttrice, prodotto);
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    prodotti.push({ direttrice, prodotto });
  }
  if (prodotti.length > 0) return prodotti;
  const prodotto = unaRiga(typeof r.prodotto === 'string' ? r.prodotto : '');
  return prodotto
    ? [{ direttrice: unaRiga(typeof r.direttrice === 'string' ? r.direttrice : ''), prodotto }]
    : [];
}

/** Una riga del database nella forma del catalogo. */
export function rigaTl(r: Record<string, unknown>): Tl {
  const prodotti = prodottiDaRiga(r);
  const primo = prodotti[0] ?? null;
  return {
    id: Number(r.id),
    codice: String(r.codice ?? ''),
    descrizione: String(r.descrizione ?? ''),
    checkList: r.check_list === true,
    versoCheckList:
      r.verso_check_list === 'COLLABORATIVA' || r.verso_check_list === 'RESISTENZA'
        ? r.verso_check_list
        : null,
    prodotti,
    direttrice: primo?.direttrice ?? (r.direttrice as string | null) ?? null,
    prodotto: primo?.prodotto ?? (r.prodotto as string | null) ?? null,
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

/** Una riga già in catalogo, ridotta a ciò che serve al confronto del codice. */
export interface RigaCodiceTl {
  id: number;
  codice: string;
  prodotti: ProdottoTl[];
}

/**
 * IL CONFLITTO DEL CODICE, oppure null (0.167.0).
 *
 * Il codice identifica la TS dentro il prodotto: la stessa 81 può stare su due
 * prodotti diversi con la descrizione che le è propria. Il divieto resta dove
 * nascerebbe un doppione — stesso codice sullo stesso prodotto — e per le TS
 * che un prodotto non ce l'hanno: senza posto non c'è modo di distinguerle.
 */
export function conflittoCodiceTl(
  codice: string,
  prodotti: ProdottoTl[],
  altre: RigaCodiceTl[]
): string | null {
  const chiave = chiaveTl(codice);
  if (!chiave) return null;
  const stesse = altre.filter((a) => chiaveTl(a.codice) === chiave);
  if (stesse.length === 0) return null;

  const miei = new Set(prodotti.map((p) => chiaveProdottoTl(p.direttrice, p.prodotto)));
  if (miei.size === 0) {
    return stesse.some((a) => a.prodotti.length === 0)
      ? `Esiste già una TS con il codice «${unaRiga(codice)}», senza prodotto: assegnale i prodotti invece di crearne un'altra.`
      : null;
  }

  for (const altra of stesse) {
    for (const p of altra.prodotti) {
      if (miei.has(chiaveProdottoTl(p.direttrice, p.prodotto)))
        return `Esiste già una TS con il codice «${unaRiga(codice)}» per «${etichettaProdottoTl(p)}»: aggiungi lì il prodotto, oppure usa un altro codice.`;
    }
  }
  return null;
}

/** «VIGILANZA DOCUMENTALE · Diffida M400»: l'associazione come si legge. */
export function etichettaProdottoTl(p: ProdottoTl): string {
  const direttrice = unaRiga(p.direttrice);
  const prodotto = unaRiga(p.prodotto);
  return direttrice ? `${direttrice} · ${prodotto}` : prodotto;
}
