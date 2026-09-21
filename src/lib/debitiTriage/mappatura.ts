// src/lib/debitiTriage/mappatura.ts
//
// MAPPATURA DEI PROSPETTI LIBERI.
//
// Un prospetto che la piattaforma non riconosce non viene scartato: chi lo
// carica indica una volta come leggerlo, e da lì in poi lo stesso tracciato
// dello stesso ente si riconosce da solo.
//
// ---------------------------------------------------------------------------
// LE DUE FORME, scelte da Ercole
//
// RIEPILOGO — una colonna per anno:
//
//     Voce              | 2026   | 2025    | 2024
//     Contributi INPS   | 98.928 | 418.709 | 385.200
//
// DETTAGLIO — una riga per movimento o periodo, con una data:
//
//     Voce               | Data       | Importo
//     Contributi gennaio | 16/02/2025 | 35.253
//
// Nel dettaglio l'anno non c'è: si ricava dalla data e gli importi si
// SOMMANO per anno. È la forma più diffusa nei prospetti veri — estratti
// conto, partitari, e gli stessi fogli INPS, dove ogni riga è un periodo.
// Una colonna d'anno (forma "anno + importo") ne è un caso particolare: una
// data ridotta all'osso.
//
// ---------------------------------------------------------------------------
// NESSUNA INTERPRETAZIONE NOSTRA
//
// La mappatura la decide chi carica. La piattaforma PROPONE gli abbinamenti
// riconoscendo i nomi delle intestazioni, ma non li applica da sé, e non si
// chiede a un modello di indovinare cosa significa una colonna: la lettura
// del documento resta di chi lo conosce. È il principio dei dati ufficiali
// applicato fino in fondo.

import type { CategoriaDebito, RigaDebitoTriage } from './modello';

export type FormaProspetto = 'RIEPILOGO' | 'DETTAGLIO';

export interface MappaturaProspetto {
  forma: FormaProspetto;
  /** Indice (0-based) della riga di intestazione. */
  rigaIntestazione: number;
  /** Colonna della descrizione della posizione; null se assente. */
  colDescrizione: number | null;
  /** Categoria di tutto il file. Vale se `colCategoria` è null. */
  categoriaFile: CategoriaDebito | null;
  /** Colonna i cui valori si traducono in categorie. */
  colCategoria: number | null;
  /** Traduzione dei valori di `colCategoria` (normalizzati) in categorie. */
  mappaCategorie: Record<string, CategoriaDebito>;
  /** RIEPILOGO: colonne che portano un anno nell'intestazione. */
  colonneAnno: number[];
  /** DETTAGLIO: colonna della data (o del periodo). */
  colData: number | null;
  /** DETTAGLIO: colonna dell'importo. */
  colImporto: number | null;
}

// ---------------------------------------------------------------------------
// LA FIRMA DI UN TRACCIATO
//
// Serve a riconoscere lo stesso tracciato alla volta successiva. Si
// costruisce dalle intestazioni normalizzate — minuscole, senza spazi né
// punteggiatura — con un accorgimento decisivo: GLI ANNI SI TOLGONO.
//
// Un riepilogo ha le colonne "2026 | 2025 | 2024" quest'anno e "2027 | 2026
// | 2025" l'anno prossimo. Con gli anni dentro la firma, lo stesso tracciato
// sembrerebbe diverso ogni anno e la mappatura salvata non servirebbe mai.

export function firmaIntestazioni(intestazioni: unknown[]): string {
  return intestazioni
    .map((c) =>
      String(c ?? '')
        .toLowerCase()
        .replace(/\b(19|20)\d{2}\b/g, '#anno')
        .replace(/[^a-z0-9#]/g, '')
    )
    .filter((c) => c.length > 0)
    .join('|');
}

/** Riga di intestazione più probabile: la prima con almeno due testi. */
export function individuaIntestazione(aoa: unknown[][]): number {
  for (let r = 0; r < Math.min(aoa.length, 20); r++) {
    const testi = (aoa[r] ?? []).filter(
      (c) => typeof c === 'string' && c.trim().length > 0 && !/^[\d.,\s€-]+$/.test(c)
    );
    if (testi.length >= 2) return r;
  }
  return 0;
}

/** L'anno scritto in un'intestazione di colonna, se c'è. */
export function annoDaIntestazione(v: unknown): number | null {
  const m = String(v ?? '').match(/\b((?:19|20)\d{2})\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Proposta di mappatura, riconoscendo i nomi delle intestazioni.
 *
 * È una PROPOSTA: la piattaforma non la applica, la mostra e chi carica la
 * conferma o la corregge.
 */
export function proponiMappatura(aoa: unknown[][]): MappaturaProspetto {
  const r = individuaIntestazione(aoa);
  const int = (aoa[r] ?? []).map((c) => String(c ?? '').toLowerCase());
  const trova = (re: RegExp) => {
    const i = int.findIndex((c) => re.test(c));
    return i >= 0 ? i : null;
  };
  const colonneAnno = int
    .map((c, i) => (annoDaIntestazione(c) !== null ? i : -1))
    .filter((i) => i >= 0);

  return {
    // Due o più colonne con un anno nel nome sono il segno del riepilogo.
    forma: colonneAnno.length >= 2 ? 'RIEPILOGO' : 'DETTAGLIO',
    rigaIntestazione: r,
    colDescrizione: trova(/descri|voce|causale|denominaz|tipologia/),
    categoriaFile: null,
    colCategoria: trova(/categoria|natura|gestione|tributo/),
    mappaCategorie: {},
    colonneAnno,
    colData: trova(/data|periodo|competenza|scadenza/),
    colImporto: trova(/importo|saldo|debito|dovuto|residuo|totale/),
  };
}

// ---------------------------------------------------------------------------
// LETTURA DI NUMERI E DATE

function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const pulito = s.replace(/[^\d,.-]/g, '');
  if (pulito === '' || pulito === '-') return null;
  return Number.isFinite(leggiImportoItaliano(pulito)) ? leggiImportoItaliano(pulito) : null;
}

/**
 * Un importo scritto all'italiana.
 *
 * Il caso che conta: "418.709" senza virgola. In inglese sarebbe
 * quattrocentodiciotto virgola settecentonove; in un prospetto italiano è
 * QUATTROCENTODICIOTTOMILA. La prima versione lo leggeva all'inglese, e gli
 * importi uscivano divisi per mille — senza errori, senza avvisi. Il test sul
 * riepilogo l'ha preso.
 *
 * Regole, nell'ordine:
 *   - c'è una virgola          -> è il decimale, i punti sono migliaia;
 *   - più di un punto          -> sono tutti migliaia ("1.213.831");
 *   - un punto e 3 cifre dopo  -> migliaia ("418.709");
 *   - un punto e 1-2 cifre     -> decimale ("35.25").
 *
 * Il caso "1.234" resta ambiguo per natura. Si legge come milleduecento,
 * perché la piattaforma lavora su documenti italiani: è la lettura giusta
 * nella quasi totalità dei prospetti che vedrà.
 */
export function leggiImportoItaliano(s: string): number {
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  const punti = (s.match(/\./g) ?? []).length;
  if (punti > 1) return Number(s.replace(/\./g, ''));
  if (punti === 1) {
    const dopo = s.split('.')[1] ?? '';
    return dopo.length === 3 ? Number(s.replace('.', '')) : Number(s);
  }
  return Number(s);
}

/** L'anno di una data o di un periodo, qualunque sia la forma. */
export function annoDa(v: unknown): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getUTCFullYear();
  // Numero seriale di Excel (giorni dal 30/12/1899): i fogli lo usano spesso
  // per le date, e letto come numero darebbe un "anno" di cinque cifre.
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).getUTCFullYear();
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^\d{1,2}[/.-]\d{1,2}[/.-]((?:19|20)\d{2})/); // gg/mm/aaaa
  if (m) return Number(m[1]);
  m = s.match(/^((?:19|20)\d{2})[/.-]\d{1,2}/); // aaaa-mm(-gg) e aaaa/mm
  if (m) return Number(m[1]);
  m = s.match(/^\d{1,2}[/.-]((?:19|20)\d{2})$/); // mm/aaaa
  if (m) return Number(m[1]);
  m = s.match(/^((?:19|20)\d{2})$/); // aaaa
  if (m) return Number(m[1]);
  return null;
}

const normalizza = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();

function categoriaDi(riga: unknown[], m: MappaturaProspetto): CategoriaDebito | null {
  if (m.colCategoria !== null) {
    const chiave = normalizza(riga[m.colCategoria]);
    return m.mappaCategorie[chiave] ?? m.categoriaFile;
  }
  return m.categoriaFile;
}

export interface EsitoEstrazione {
  righe: RigaDebitoTriage[];
  /** Righe scartate e perché: si dichiara ciò che non si è usato. */
  scartate: { motivo: string; quante: number }[];
  /** Anni presenti nel file ma fuori dai tre del triage. */
  anniFuoriFinestra: number[];
}

/**
 * Applica la mappatura al foglio e produce le righe della tabella.
 *
 * Si considerano solo i tre anni del triage: gli altri si DICHIARANO, non si
 * perdono in silenzio — chi ha caricato un prospetto decennale deve sapere
 * che sette anni sono rimasti fuori.
 */
export function estraiRighe(
  aoa: unknown[][],
  m: MappaturaProspetto,
  anni: { corrente: number; precedente: number; meno2: number },
  prospettoId: number | null,
  nomeFile: string
): EsitoEstrazione {
  const dati = aoa.slice(m.rigaIntestazione + 1);
  const intestazione = aoa[m.rigaIntestazione] ?? [];
  const fuori = new Set<number>();
  const scarti: Record<string, number> = {};
  const scarta = (motivo: string) => (scarti[motivo] = (scarti[motivo] ?? 0) + 1);

  const campoDi = (anno: number): keyof RigaDebitoTriage | null =>
    anno === anni.corrente
      ? 'importoAnnoCorrente'
      : anno === anni.precedente
        ? 'importoAnnoPrecedente'
        : anno === anni.meno2
          ? 'importoAnnoMeno2'
          : null;

  const nuova = (descrizione: string, categoria: CategoriaDebito): RigaDebitoTriage => ({
    descrizione,
    categoria,
    importoAnnoCorrente: null,
    importoAnnoPrecedente: null,
    importoAnnoMeno2: null,
    riferimentoAnnoPrecedente: null,
    prospettoId,
  });

  // ---- RIEPILOGO: una riga del foglio, una riga della tabella ----------
  if (m.forma === 'RIEPILOGO') {
    const righe: RigaDebitoTriage[] = [];
    for (const riga of dati) {
      if (!riga || riga.every((c) => c === null || String(c).trim() === '')) continue;
      const cat = categoriaDi(riga, m);
      if (!cat) {
        scarta('categoria non attribuita');
        continue;
      }
      const descr = m.colDescrizione !== null ? String(riga[m.colDescrizione] ?? '').trim() : '';
      const r = nuova(descr || nomeFile, cat);
      let qualcosa = false;
      for (const col of m.colonneAnno) {
        const anno = annoDaIntestazione(intestazione[col]);
        if (anno === null) continue;
        const campo = campoDi(anno);
        if (!campo) {
          fuori.add(anno);
          continue;
        }
        const v = numero(riga[col]);
        if (v !== null) {
          (r[campo] as number | null) = ((r[campo] as number | null) ?? 0) + v;
          qualcosa = true;
        }
      }
      if (qualcosa) righe.push(r);
      else scarta('nessun importo negli anni del triage');
    }
    return { righe, scartate: esporta(scarti), anniFuoriFinestra: [...fuori].sort() };
  }

  // ---- DETTAGLIO: si somma per categoria e per anno -------------------
  // Raggruppare per descrizione darebbe una riga per mese ("contributi
  // gennaio", "contributi febbraio"...): inutile per un triage. Il
  // raggruppamento naturale di un dettaglio è la categoria.
  const perCategoria = new Map<CategoriaDebito, RigaDebitoTriage>();
  if (m.colData === null || m.colImporto === null) {
    return {
      righe: [],
      scartate: [{ motivo: 'colonna della data o dell’importo non indicata', quante: dati.length }],
      anniFuoriFinestra: [],
    };
  }
  for (const riga of dati) {
    if (!riga || riga.every((c) => c === null || String(c).trim() === '')) continue;
    const cat = categoriaDi(riga, m);
    if (!cat) {
      scarta('categoria non attribuita');
      continue;
    }
    const anno = annoDa(riga[m.colData]);
    if (anno === null) {
      scarta('data non leggibile');
      continue;
    }
    const campo = campoDi(anno);
    if (!campo) {
      fuori.add(anno);
      continue;
    }
    const v = numero(riga[m.colImporto]);
    if (v === null) {
      scarta('importo non leggibile');
      continue;
    }
    const r = perCategoria.get(cat) ?? nuova(`${nomeFile}`, cat);
    (r[campo] as number | null) = ((r[campo] as number | null) ?? 0) + v;
    perCategoria.set(cat, r);
  }
  return {
    righe: [...perCategoria.values()],
    scartate: esporta(scarti),
    anniFuoriFinestra: [...fuori].sort(),
  };
}

function esporta(scarti: Record<string, number>) {
  return Object.entries(scarti).map(([motivo, quante]) => ({ motivo, quante }));
}
