// src/lib/checklist/prodotti.ts
//
// LA CHECK LIST DEI PRODOTTI (0.159.0).
//
// Il triage risponde a due domande diverse: che cosa dicono i documenti
// (visura, prospetti, V.E.R.A.) e che cosa l'azienda ha attivato davanti
// all'ente, prodotto per prodotto. La prima è la check list dello screening,
// che resta come lettura storica e non si compila più. La seconda è questa:
// nasce dal catalogo delle TL — un prodotto, le sue lavorazioni — e si
// compila subito prima dell'elaborazione del triage.
//
// PERCHÉ SUL PRODOTTO. Il prodotto è ciò che l'ente lavora (DURC, IVA,
// contributi): una domanda per prodotto dice se quella parte del rapporto è
// stata attivata e con quale esito, senza chiedere all'operatore di ricostruire
// l'albero delle materie. Le TL del prodotto restano nel testo della domanda,
// così la risposta resta agganciata alla lavorazione che la genera.
//
// SENZA AI SI GENERA LO STESSO. Le domande di base si ricavano dal catalogo,
// una per TL: se l'AI non risponde (chiave assente, servizio giù) la check
// list esiste comunque e resta compilabile. Una funzione che si blocca perché
// manca un servizio esterno è un triage che non si chiude.
//
// Logica pura, con i suoi test.

/** Il catalogo come lo legge il database: una riga per TL, con il prodotto. */
export interface TlCatalogo {
  id: number;
  direttrice: string;
  prodotto: string;
  tipologia: string;
  dipendenza: string | null;
  /** Passi della lavorazione, se configurati: entrano nel testo come traccia. */
  procedura?: string | null;
  ordine?: number | null;
}

export interface DomandaProdotto {
  prodotto: string;
  direttrice: string | null;
  domanda: string;
  ordine: number;
}

/** Il massimo di domande che una check list può contenere: oltre, non si legge. */
export const MASSIMO_DOMANDE_PRODOTTI = 80;

const normalizza = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Le domande di base, una per TL del catalogo. Il testo è volutamente
 * chiuso: chiede se la lavorazione è stata attivata, non come andrebbe
 * svolta — quella è la procedura, che sta nei parametri.
 */
export function domandeDaCatalogo(tl: TlCatalogo[]): DomandaProdotto[] {
  const viste = new Set<string>();
  const out: DomandaProdotto[] = [];
  for (const t of tl) {
    const prodotto = normalizza(t.prodotto);
    const tipologia = normalizza(t.tipologia);
    if (!prodotto || !tipologia) continue;
    const chiave = `${prodotto.toLowerCase()}|${tipologia.toLowerCase()}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    const ufficio = t.dipendenza ? ` (ufficio ${normalizza(t.dipendenza)})` : '';
    out.push({
      prodotto,
      direttrice: t.direttrice ? normalizza(t.direttrice) : null,
      domanda: `La lavorazione «${tipologia}»${ufficio} del prodotto «${prodotto}» risulta attivata nei confronti dell'azienda?`,
      ordine: typeof t.ordine === 'number' && Number.isFinite(t.ordine) ? t.ordine : out.length,
    });
    if (out.length >= MASSIMO_DOMANDE_PRODOTTI) break;
  }
  return out;
}

/**
 * Le domande proposte dall'AI. Non ci si fida della forma: prodotto e testo
 * possono arrivare vuoti, doppi o lunghissimi, e una domanda vuota a video è
 * peggio di una domanda mancante. Ciò che non passa i controlli si scarta.
 */
export function pulisciDomandeGenerate(grezzo: unknown): DomandaProdotto[] {
  const elenco = Array.isArray(grezzo)
    ? grezzo
    : grezzo &&
        typeof grezzo === 'object' &&
        Array.isArray((grezzo as { domande?: unknown }).domande)
      ? ((grezzo as { domande: unknown[] }).domande ?? [])
      : [];

  const viste = new Set<string>();
  const out: DomandaProdotto[] = [];
  for (const voce of elenco) {
    if (!voce || typeof voce !== 'object') continue;
    const v = voce as Record<string, unknown>;
    const prodotto = normalizza(typeof v.prodotto === 'string' ? v.prodotto : '');
    const domanda = normalizza(typeof v.domanda === 'string' ? v.domanda : '');
    if (!prodotto || !domanda) continue;
    if (prodotto.length > 120 || domanda.length > 400) continue;
    const direttrice =
      typeof v.direttrice === 'string' && v.direttrice.trim() ? normalizza(v.direttrice) : null;
    const chiave = `${prodotto.toLowerCase()}|${domanda.toLowerCase()}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    out.push({ prodotto, direttrice, domanda, ordine: out.length });
    if (out.length >= MASSIMO_DOMANDE_PRODOTTI) break;
  }
  return out;
}

/** Una riga della check list salvata: la domanda e la risposta data. */
export interface RigaChecklistProdotto {
  id: number;
  prodotto: string;
  direttrice: string | null;
  domanda: string;
  risposta: boolean | null;
  note: string | null;
  ordine: number;
}

export interface SezioneProdotto {
  prodotto: string;
  direttrice: string | null;
  righe: RigaChecklistProdotto[];
  totale: number;
  risposte: number;
  /** Domande con risposta «No»: sono le lavorazioni non attivate. */
  criticita: number;
  completa: boolean;
}

export interface SintesiChecklistProdotti {
  sezioni: SezioneProdotto[];
  totale: number;
  risposte: number;
  criticita: number;
  /** Domande rimaste senza risposta, per prodotto: è ciò che manca al triage. */
  senzaRisposta: { prodotto: string; domanda: string }[];
  completa: boolean;
}

/**
 * Raggruppa per prodotto conservando l'ordine del catalogo. Un prodotto
 * senza domande non compare: la sezione vuota non è una sezione.
 */
export function sintesiChecklistProdotti(righe: RigaChecklistProdotto[]): SintesiChecklistProdotti {
  const perProdotto = new Map<string, SezioneProdotto>();
  for (const r of righe) {
    const chiave = r.prodotto.toLowerCase();
    let sezione = perProdotto.get(chiave);
    if (!sezione) {
      sezione = {
        prodotto: r.prodotto,
        direttrice: r.direttrice,
        righe: [],
        totale: 0,
        risposte: 0,
        criticita: 0,
        completa: false,
      };
      perProdotto.set(chiave, sezione);
    }
    sezione.righe.push(r);
    sezione.totale += 1;
    if (r.risposta !== null) {
      sezione.risposte += 1;
      if (r.risposta === false) sezione.criticita += 1;
    }
  }
  const sezioni = Array.from(perProdotto.values());
  for (const s of sezioni) {
    s.righe.sort((a, b) => a.ordine - b.ordine || a.id - b.id);
    s.completa = s.totale > 0 && s.risposte === s.totale;
  }
  const senzaRisposta = sezioni.flatMap((s) =>
    s.righe
      .filter((r) => r.risposta === null)
      .map((r) => ({ prodotto: s.prodotto, domanda: r.domanda }))
  );
  const totale = sezioni.reduce((a, s) => a + s.totale, 0);
  const risposte = sezioni.reduce((a, s) => a + s.risposte, 0);
  return {
    sezioni,
    totale,
    risposte,
    criticita: sezioni.reduce((a, s) => a + s.criticita, 0),
    senzaRisposta,
    completa: totale > 0 && risposte === totale,
  };
}
