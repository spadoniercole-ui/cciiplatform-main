// src/lib/soglie25novies/vistaSpazio.ts
//
// LA VISTA D'INSIEME: quali aziende dello spazio hanno un rapporto contributi
// che sale, e quanto di quel debito è scaduto da oltre 90 giorni.
//
// La scheda Indici risponde azienda per azienda. Il ricalcolo d'ufficio scrive
// la serie di tutte le aziende verificate in `aziende.contributi_per_anno`.
// Qui le due cose si leggono insieme: la tabella che ne esce serve a decidere
// dove guardare, non a decidere l'esito — quello resta nella scheda, con il
// dettaglio dei singoli esercizi.
//
// ---------------------------------------------------------------------------
// CHE COSA VUOL DIRE «IN CRESCITA»
//
// Il rapporto è scaduti / dovuti: una quota. Cresce quando l'ultima quota
// calcolabile è più alta della prima. Non si confrontano anni consecutivi, ma
// il primo e l'ultimo punto che si possono calcolare: se un esercizio ha il
// dovuto e non lo scaduto, il rapporto di quell'anno non esiste (non è zero) e
// saltarlo è più onesto che inventargli un lato. Per lo stesso motivo servono
// almeno due quote: con un solo punto non c'è una crescita, c'è un dato.
//
// La variazione si misura in PUNTI PERCENTUALI (34,0% − 12,4% = 21,6 punti) e
// non in percentuale della quota: «+174%» su una base del 12% farebbe sembrare
// enorme un movimento di venti punti, che è già leggibile da solo.
//
// «In crescita» NON è «soglia superata». L'art. 25-novies, lett. a) richiede
// anche il ritardo di oltre 90 giorni (e, con lavoratori, i 15.000 euro): una
// crescita dal 2% al 4% è comunque una crescita, e non è una fattispecie. La
// vista mostra le due cose accanto, non le somma in un verdetto.
//
// ---------------------------------------------------------------------------
// IL RITARDO OLTRE 90 GIORNI
//
// Ogni anno della serie può portare `oltre90`: la parte dei suoi scaduti già
// scaduta da più di 90 giorni alla data della verifica. La serie ricostruita
// dalle posizioni del triage o dai valori conservati NON lo porta, e resta a
// null: nella tabella compare «—», mai uno zero. Uno zero scritto al posto di
// un dato non misurato direbbe che il requisito è assente, che è una
// conclusione, mentre qui manca la misura.

import {
  rapportiPerAnno,
  type ContributiAnno,
  type RapportoAnno,
} from '@/lib/soglie25novies/rapportoAnni';

/** Da dove viene la serie conservata. */
export type OrigineSerie = 'file' | 'posizioni' | 'valori';

/** Un'azienda con la sua serie, come la restituisce il database. */
export interface AziendaConSerie {
  aziendaId: number;
  ragioneSociale: string;
  anni: readonly ContributiAnno[];
  origine: OrigineSerie;
  /** Giorno della verifica a cui si riferiscono i valori ricostruiti. */
  ricostruitaIl: string | null;
}

/** Una quota calcolabile, con il suo esercizio. */
export interface QuotaAnno {
  anno: number;
  quota: number;
}

/** Una riga della vista: la serie, la crescita e il ritardo. */
export interface RigaVistaContributi {
  aziendaId: number;
  ragioneSociale: string;
  /** Tutti gli anni conservati, con quota e ritardo (null dove non misurati). */
  anni: RapportoAnno[];
  /** Solo le quote calcolabili, in ordine di anno. */
  quote: QuotaAnno[];
  prima: QuotaAnno | null;
  ultima: QuotaAnno | null;
  /** Ultima quota meno prima, in punti percentuali; null con meno di due quote. */
  variazionePunti: number | null;
  /** L'ultima quota calcolabile supera la prima. */
  inCrescita: boolean;
  /** Somma degli oltre 90 giorni MISURATI; null se nessun anno li misura. */
  oltre90: number | null;
  /** Esercizi in cui il ritardo misurato è maggiore di zero. */
  anniConRitardo: number[];
  origine: OrigineSerie;
  ricostruitaIl: string | null;
}

/**
 * Costruisce la vista, ordinata: prima le aziende in crescita, dalla
 * variazione più forte alla più debole; poi le altre, in ordine alfabetico.
 *
 * L'ordine è la risposta alla domanda «da dove comincio»: chi sale di più sta
 * in alto. Le aziende senza due quote calcolabili restano in tabella, perché
 * «non lo so» è un fatto da vedere, non una riga da nascondere.
 */
export function vistaContributiSpazio(aziende: readonly AziendaConSerie[]): RigaVistaContributi[] {
  const righe = aziende.map((a) => {
    const anni = rapportiPerAnno(a.anni);
    const quote: QuotaAnno[] = anni
      .filter((r): r is RapportoAnno & { quota: number } => r.quota !== null)
      .map((r) => ({ anno: r.anno, quota: r.quota }));
    const prima = quote[0] ?? null;
    const ultima = quote[quote.length - 1] ?? null;
    const variazionePunti =
      prima && ultima && quote.length >= 2 ? (ultima.quota - prima.quota) * 100 : null;
    const misurati = anni.filter((r) => r.oltre90 !== null && r.oltre90 !== undefined);
    return {
      aziendaId: a.aziendaId,
      ragioneSociale: a.ragioneSociale,
      anni,
      quote,
      prima,
      ultima,
      variazionePunti,
      inCrescita: variazionePunti !== null && variazionePunti > 0,
      oltre90: misurati.length === 0 ? null : misurati.reduce((s, r) => s + (r.oltre90 ?? 0), 0),
      anniConRitardo: misurati.filter((r) => (r.oltre90 ?? 0) > 0).map((r) => r.anno),
      origine: a.origine,
      ricostruitaIl: a.ricostruitaIl,
    };
  });

  return righe.sort((a, b) => {
    if (a.inCrescita !== b.inCrescita) return a.inCrescita ? -1 : 1;
    if (a.inCrescita && b.inCrescita) {
      const va = a.variazionePunti ?? 0;
      const vb = b.variazionePunti ?? 0;
      if (va !== vb) return vb - va;
    }
    return a.ragioneSociale.localeCompare(b.ragioneSociale, 'it');
  });
}

/** I conteggi in testa alla vista: numeri veri, ognuno con il suo confine. */
export interface RiepilogoVista {
  /** Aziende con una serie conservata. */
  aziende: number;
  /** Quante hanno l'ultima quota calcolabile sopra la prima. */
  inCrescita: number;
  /** Quante hanno almeno un esercizio con ritardo misurato maggiore di zero. */
  conRitardo: number;
  /** Somma degli oltre 90 giorni misurati; null se nessuna li misura. */
  oltre90Totale: number | null;
}

export function riepilogoVistaContributi(righe: readonly RigaVistaContributi[]): RiepilogoVista {
  const misurate = righe.filter((r) => r.oltre90 !== null);
  return {
    aziende: righe.length,
    inCrescita: righe.filter((r) => r.inCrescita).length,
    conRitardo: righe.filter((r) => r.anniConRitardo.length > 0).length,
    oltre90Totale:
      misurate.length === 0 ? null : misurate.reduce((s, r) => s + (r.oltre90 ?? 0), 0),
  };
}

/**
 * I filtri della vista: quali aziende restano in tabella.
 *
 * «In crescita» e «con ritardo oltre 90 giorni» sono le due domande che la
 * pagina serve a fare — dove guardare, e chi ha già il requisito temporale —
 * e restano separate: sono cose diverse, e sommarle in un verdetto unico è
 * proprio ciò che la vista evita di fare. L'ultimo filtro le mette insieme
 * per chi vuole l'elenco corto.
 */
export type FiltroVista = 'tutte' | 'crescita' | 'ritardo' | 'interessanti';

/** I filtri nell'ordine in cui compaiono, con l'etichetta della pagina. */
export const FILTRI_VISTA: readonly { valore: FiltroVista; etichetta: string }[] = [
  { valore: 'tutte', etichetta: 'Tutte' },
  { valore: 'crescita', etichetta: 'In crescita' },
  { valore: 'ritardo', etichetta: 'Con ritardo oltre 90 giorni' },
  { valore: 'interessanti', etichetta: 'In crescita o con ritardo' },
];

/**
 * Il filtro scritto nell'URL, se è uno di quelli previsti.
 *
 * `undefined` e i valori sconosciuti ricadono su «tutte»: un parametro
 * sbagliato non deve svuotare la tabella, e un link vecchio non deve rompere
 * la pagina.
 */
export function filtroVistaDaParam(valore: string | string[] | null | undefined): FiltroVista {
  const v = Array.isArray(valore) ? valore[0] : valore;
  return FILTRI_VISTA.some((f) => f.valore === v) ? (v as FiltroVista) : 'tutte';
}

/**
 * L'azienda che merita un secondo sguardo: cresce, oppure ha un esercizio in
 * cui il ritardo oltre 90 giorni è misurato e maggiore di zero.
 *
 * Il ritardo non misurato non entra: «non lo so» non è «sì».
 */
export function rigaInteressante(r: RigaVistaContributi): boolean {
  return r.inCrescita || r.anniConRitardo.length > 0;
}

/** Le righe che restano con il filtro scelto, nello stesso ordine. */
export function filtraVistaContributi(
  righe: readonly RigaVistaContributi[],
  filtro: FiltroVista
): RigaVistaContributi[] {
  switch (filtro) {
    case 'crescita':
      return righe.filter((r) => r.inCrescita);
    case 'ritardo':
      return righe.filter((r) => r.anniConRitardo.length > 0);
    case 'interessanti':
      return righe.filter(rigaInteressante);
    default:
      return [...righe];
  }
}

/**
 * La provenienza della serie, in una riga: la stessa nella tabella e nel
 * foglio Excel, così i due non possono divergere.
 *
 * Un'origine «file» non porta la data di ricostruzione: i file sono la fonte,
 * non una ricostruzione da datare.
 */
export function etichettaFonte(
  r: Pick<RigaVistaContributi, 'origine' | 'ricostruitaIl' | 'anni'>
): string {
  if (r.origine !== 'file') {
    const base = r.origine === 'posizioni' ? 'posizioni triage' : 'valori conservati';
    if (!r.ricostruitaIl) return base;
    const [anno, mese, giorno] = r.ricostruitaIl.split('-');
    return `${base} · ${giorno}/${mese}/${anno}`;
  }

  // «DM10 / inadempienze» è vero solo se ENTRAMBI i file hanno contribuito.
  // Con un solo lato la serie si dichiara per quello che è: scrivere anche
  // l'altro farebbe credere letto un file che non ha dato nemmeno un anno —
  // che è esattamente ciò che si vede quando un periodo non si legge.
  const haDovuti = r.anni.some((a) => a.dovuti !== null);
  const haScaduti = r.anni.some((a) => a.scaduti !== null);
  if (haDovuti && haScaduti) return 'DM10 / inadempienze';
  if (haDovuti) return 'DM10 (denunce)';
  if (haScaduti) return 'lista inadempienze';
  return 'file senza importi';
}
