// src/lib/checklist/direttriciEnte.ts
//
// I PRODOTTI DELLE DIRETTRICI E LE LORO LAVORAZIONI (TL).
//
// Un prodotto è l'ancoraggio concreto su cui nasce la domanda dello screening
// (0.109.x): «DURC», «cassa integrazione», «diffida amministrativa». Ma lo
// stesso prodotto lo stesso ente lo lavora con più TL — la diffida
// amministrativa per il ticket licenziamento sta insieme a sgravi e variazioni
// da verbali altrui — e senza il legame la domanda finiva nel calderone della
// materia: una TL su tre, indistinguibili.
//
// QUI IL FORMATO SALVATO VECCHIO RESTA VALIDO. Un prodotto è, in lettura,
// `string | { nome, lavorazioneIds }`: le configurazioni scritte come stringhe
// continuano a funzionare come sono, senza migrazione e senza toccare i dati.
// Si normalizza in lettura e si riscrive nella forma più semplice possibile —
// stringa se il prodotto non ha TL, oggetto se ne ha — così chi non usa il
// legame non si trova un JSON diverso da quello che ha scritto.
//
// `lavorazioneIds` è un elenco e non un id singolo: la stessa diffida vive in
// più TL e una domanda sola può riguardarle tutte, senza costringere a
// sceglierne una.
//
// I pesi non cambiano: si conta sempre il numero di prodotti, non le TL
// (vedi scoringDirettrici). Il legame serve alla domanda, non al punteggio.
//
// Logica pura: nessun accesso al database, così si verifica con i test.

/** Un prodotto con le TL che lo lavorano. */
export interface ProdottoConLavorazioni {
  nome: string;
  /** Gli id delle TL in `materie_lavorazione`: si scelgono, non si riscrivono. */
  lavorazioneIds: number[];
}

/** Il prodotto come è salvato: stringa (prima del legame) o oggetto con le TL. */
export type ProdottoDirettrice = string | { nome: string; lavorazioneIds?: number[] };

export interface DirettriceConProdotti {
  nome: string;
  prodotti: ProdottoDirettrice[];
}

/** Una TL come serve a questa configurazione: nome, ufficio che la esegue. */
export interface LavorazioneDescrivibile {
  id: number;
  tipologia: string;
  dipendenza?: string | null;
}

const esiste = (v: string | null | undefined): v is string => !!v && v.trim() !== '';

/** Solo id interi positivi, senza doppioni: un id storto non è un legame. */
function idLavorazioniUnici(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const visti = new Set<number>();
  for (const x of ids) {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0) visti.add(n);
  }
  return Array.from(visti);
}

/**
 * Il prodotto nella sua forma unica, qualunque cosa sia salvata: le
 * configurazioni a stringa diventano un prodotto senza TL, non un errore.
 */
export function normalizzaProdotto(
  prodotto: ProdottoDirettrice | null | undefined
): ProdottoConLavorazioni {
  if (typeof prodotto === 'string') return { nome: prodotto.trim(), lavorazioneIds: [] };
  if (!prodotto || typeof prodotto !== 'object') return { nome: '', lavorazioneIds: [] };
  return {
    nome: typeof prodotto.nome === 'string' ? prodotto.nome.trim() : '',
    lavorazioneIds: idLavorazioniUnici(prodotto.lavorazioneIds),
  };
}

/** La direttrice normalizzata: nomi puliti, prodotti vuoti scartati. */
export function normalizzaDirettrice(
  direttrice: DirettriceConProdotti | null | undefined
): DirettriceConProdotti {
  return {
    nome: (direttrice?.nome ?? '').trim(),
    prodotti: (Array.isArray(direttrice?.prodotti) ? direttrice.prodotti : [])
      .map(normalizzaProdotto)
      .filter((p) => p.nome !== ''),
  };
}

/** Il prodotto da salvare: stringa se non ha TL, così il dato resta com'era. */
export function serializzaProdotto(prodotto: ProdottoDirettrice): ProdottoDirettrice {
  const { nome, lavorazioneIds } = normalizzaProdotto(prodotto);
  return lavorazioneIds.length === 0 ? nome : { nome, lavorazioneIds };
}

/** La direttrice da salvare, nella forma più semplice che la rappresenta. */
export function serializzaDirettrice(direttrice: DirettriceConProdotti): DirettriceConProdotti {
  const pulita = normalizzaDirettrice(direttrice);
  return { nome: pulita.nome, prodotti: pulita.prodotti.map(serializzaProdotto) };
}

/** Il prodotto con una TL in più (nessun doppione, nessun id non valido). */
export function conLavorazione(
  prodotto: ProdottoDirettrice,
  lavorazioneId: number
): ProdottoConLavorazioni {
  const p = normalizzaProdotto(prodotto);
  if (!Number.isInteger(lavorazioneId) || lavorazioneId <= 0) return p;
  if (p.lavorazioneIds.includes(lavorazioneId)) return p;
  return { ...p, lavorazioneIds: [...p.lavorazioneIds, lavorazioneId] };
}

/** Il prodotto senza quella TL: le altre restano. */
export function senzaLavorazione(
  prodotto: ProdottoDirettrice,
  lavorazioneId: number
): ProdottoConLavorazioni {
  const p = normalizzaProdotto(prodotto);
  return { ...p, lavorazioneIds: p.lavorazioneIds.filter((id) => id !== lavorazioneId) };
}

/**
 * Le TL configurate che il prodotto richiama, nell'ordine in cui sono
 * configurate. Un id rimasto orfano (TL eliminata) semplicemente non compare:
 * la configurazione non si rompe.
 */
export function lavorazioniDelProdotto<T extends { id: number }>(
  prodotto: ProdottoDirettrice,
  lavorazioni: T[]
): T[] {
  const ids = new Set(normalizzaProdotto(prodotto).lavorazioneIds);
  if (ids.size === 0) return [];
  return lavorazioni.filter((l) => ids.has(l.id));
}

/** La TL come si legge in un selettore: nome e ufficio accanto. */
export function etichettaLavorazione(lavorazione: LavorazioneDescrivibile): string {
  const tipologia = lavorazione.tipologia.trim();
  return esiste(lavorazione.dipendenza)
    ? `${tipologia} — ${lavorazione.dipendenza.trim()}`
    : `${tipologia} — senza ufficio`;
}

/**
 * La riga del prodotto nel prompt dello screening. Senza TL resta il nome, come
 * prima; con la TL la nomina, così la domanda nasce su quella lavorazione e non
 * sulla materia intera (le 81 non finiscono più nello stesso calderone di
 * 74/76/CIG).
 */
export function descriviProdotto(
  prodotto: ProdottoDirettrice,
  lavorazioni: LavorazioneDescrivibile[]
): string {
  const p = normalizzaProdotto(prodotto);
  const tl = lavorazioniDelProdotto(p, lavorazioni);
  if (tl.length === 0) return `- ${p.nome}`;
  const didascalia = tl
    .map((l) => {
      const nome = `«${l.tipologia.trim()}»`;
      return esiste(l.dipendenza) ? `${nome} (ufficio ${l.dipendenza.trim()})` : nome;
    })
    .join(', ');
  return `- ${p.nome} — TL ${didascalia}`;
}

/** C'è almeno un prodotto che richiama una TL? Serve alla regola del prompt. */
export function haLavorazioniNeiProdotti(
  direttrici: (DirettriceConProdotti | null | undefined)[]
): boolean {
  return direttrici.some((d) =>
    normalizzaDirettrice(d).prodotti.some((p) => normalizzaProdotto(p).lavorazioneIds.length > 0)
  );
}
