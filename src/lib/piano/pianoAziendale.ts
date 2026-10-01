// src/lib/piano/pianoAziendale.ts
//
// Il PIANO DELL'AZIENDA, normalizzato sulle righe d'ipotesi del nostro
// piano (valori assoluti in euro per anno solare). Arriva da un Excel in
// formato libero (righe = voci, colonne = anni; le voci si abbinano alle
// nostre righe, l'abbinamento si memorizza per azienda) o da un PDF letto
// dall'AI (sempre con conferma prima del salvataggio). Le voci calcolate
// (EBITDA, utile, cassa, patrimonio) non si importano: la piattaforma le
// ricalcola dalle ipotesi, con lo stesso motore del piano automatico, così
// il confronto è tra grandezze calcolate allo stesso modo.

import { normalizzaTesto } from '@/lib/bilancino/categorie';
import { numeroDaCella } from '@/lib/bilancino/lettura';
import type { IpotesiPiano, RigaInput } from './piano';

/** Righe importabili dal piano dell'azienda (l'aliquota d'imposta resta quella del piano). */
export const RIGHE_AZIENDA: RigaInput[] = [
  'ricaviVendite',
  'altriRicavi',
  'costiOperativi',
  'ammortamenti',
  'oneriFinanziari',
  'investimenti',
  'creditiClienti',
  'debitiFornitori',
  'debitiBanche',
  'apportiSoci',
];

/** Destinazioni di una voce del file: una riga d'ipotesi, i «costi della produzione» comprensivi
 * di ammortamenti (se ne toglie l'ammortamento), oppure fuori dal calcolo. */
export type DestinazioneVoce = RigaInput | 'costiProduzioneTotali' | 'esclusa';

export const ETICHETTA_DESTINAZIONE: Partial<Record<DestinazioneVoce, string>> = {
  costiProduzioneTotali: 'Costi della produzione compresi gli ammortamenti',
  esclusa: 'Non importare (voce calcolata, totale o non pertinente)',
};

/** valori[riga][anno] in euro. */
export type ValoriPianoAzienda = Partial<Record<RigaInput, Record<string, number>>>;

export interface PianoAzienda {
  valori: ValoriPianoAzienda;
  origine: 'excel' | 'pdf' | 'manuale';
  nomeFile: string | null;
  documentoId: number | null;
  note: string | null;
  salvatoIl: string | null;
}

const REGOLE: { rx: RegExp; dest: DestinazioneVoce }[] = [
  { rx: /^(totale|tot\.|subtotale)\b/, dest: 'esclusa' },
  {
    rx: /\b(ebitda|ebit|mol|margine|utile|perdita|risultato|imposte|patrimonio|cassa|liquidit|flusso|cash ?flow|dscr|pfn|posizione finanziaria)\b/,
    dest: 'esclusa',
  },
  { rx: /\bammortament|svalutazion/, dest: 'ammortamenti' },
  { rx: /\b(oneri finanziari|interessi passivi|interessi)\b/, dest: 'oneriFinanziari' },
  { rx: /\bcosti della produzione\b/, dest: 'costiProduzioneTotali' },
  { rx: /\b(altri ricavi|proventi diversi|contributi in conto esercizio)\b/, dest: 'altriRicavi' },
  { rx: /\b(ricavi|fatturato|vendite|valore delle vendite)\b/, dest: 'ricaviVendite' },
  { rx: /\b(investiment|capex|acquisti? (di )?immobilizz)/, dest: 'investimenti' },
  {
    rx: /\b(apport|versament|aumento di capitale|finanziament[oi] (dei )?soci)/,
    dest: 'apportiSoci',
  },
  { rx: /\b(crediti (v(erso|\/)? ?)?clienti|clienti)\b/, dest: 'creditiClienti' },
  { rx: /\bfornitori\b/, dest: 'debitiFornitori' },
  {
    rx: /\b(debiti (v(erso|\/)? ?)?banche|banche|finanziamenti bancari|mutu[oi]|debiti finanziari)\b/,
    dest: 'debitiBanche',
  },
  {
    rx: /\b(costi|acquisti|materie|servizi|personale|salari|stipendi|godimento|affitti|locazioni|oneri diversi|consumi|variazione (delle )?rimanenze)/,
    dest: 'costiOperativi',
  },
];

export function proponiDestinazione(etichetta: string): DestinazioneVoce | null {
  const d = normalizzaTesto(etichetta);
  if (!d) return null;
  for (const r of REGOLE) if (r.rx.test(d)) return r.dest;
  return null;
}

export interface VoceLetta {
  chiave: string; // etichetta normalizzata (per la memoria)
  etichetta: string;
  riga: number;
  valori: Record<string, number>; // anno -> valore (nell'unità del file)
}

export interface LetturaPianoExcel {
  rigaAnni: number;
  colonnaEtichetta: number;
  /** colonna -> anno */
  anni: Record<number, number>;
  voci: VoceLetta[];
  /** Unità suggerita (1, 1000, 1000000) se l'intestazione la dichiara. */
  unitaSuggerita: number;
}

const RX_ANNO = /(?<!\d)(20\d{2})(?!\d)/;

/** Legge un foglio con le voci in righe e gli anni in colonne. */
export function leggiPianoExcel(righe: unknown[][]): LetturaPianoExcel | null {
  const testo = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
  // Riga degli anni: la prima (entro 30) con almeno due celle che contengono un anno.
  let rigaAnni = -1;
  let anni: Record<number, number> = {};
  for (let r = 0; r < Math.min(30, righe.length); r++) {
    const trovati: Record<number, number> = {};
    (righe[r] || []).forEach((c, i) => {
      const s = typeof c === 'number' ? String(c) : testo(c);
      const m = s.match(RX_ANNO);
      if (m && s.length <= 30) trovati[i] = Number(m[1]);
    });
    if (Object.keys(trovati).length >= 2) {
      rigaAnni = r;
      anni = trovati;
      break;
    }
  }
  if (rigaAnni < 0) return null;
  const colonneAnni = new Set(Object.keys(anni).map(Number));
  // Colonna delle etichette: quella con più testo sotto la riga degli anni, fuori dalle colonne anno.
  const conteggi = new Map<number, number>();
  for (const riga of righe.slice(rigaAnni + 1)) {
    (riga || []).forEach((c, i) => {
      if (colonneAnni.has(i)) return;
      if (typeof c === 'string' && c.trim() && numeroDaCella(c) === null)
        conteggi.set(i, (conteggi.get(i) ?? 0) + 1);
    });
  }
  const colonnaEtichetta = [...conteggi.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const intestazione = righe
    .slice(0, rigaAnni + 1)
    .flat()
    .map(testo)
    .join(' ')
    .toLowerCase();
  const unitaSuggerita = /milioni|€\s*\/\s*mln|mln/.test(intestazione)
    ? 1_000_000
    : /migliaia|€\s*\/\s*000|k€|€\s*000|\(000\)/.test(intestazione)
      ? 1000
      : 1;
  const voci: VoceLetta[] = [];
  const viste = new Map<string, number>();
  for (let r = rigaAnni + 1; r < righe.length; r++) {
    const riga = righe[r] || [];
    const etichetta = testo(riga[colonnaEtichetta]);
    if (!etichetta) continue;
    const valori: Record<string, number> = {};
    for (const [col, anno] of Object.entries(anni)) {
      const n = numeroDaCella(riga[Number(col)]);
      if (n !== null) valori[String(anno)] = n;
    }
    if (Object.keys(valori).length === 0) continue;
    let chiave = normalizzaTesto(etichetta);
    const k = (viste.get(chiave) ?? 0) + 1;
    viste.set(chiave, k);
    if (k > 1) chiave = `${chiave}#${k}`;
    voci.push({ chiave, etichetta, riga: r + 1, valori });
  }
  return { rigaAnni, colonnaEtichetta, anni, voci, unitaSuggerita };
}

/** Dalle voci abbinate ai valori per riga d'ipotesi (in euro). Più voci sulla stessa riga si sommano;
 * i «costi della produzione compresi gli ammortamenti» si riducono dell'ammortamento dello stesso anno. */
export function valoriDaVoci(
  voci: VoceLetta[],
  abbinamento: Record<string, DestinazioneVoce | undefined>,
  unita: number
): ValoriPianoAzienda {
  const out: ValoriPianoAzienda = {};
  const totaliProduzione: Record<string, number> = {};
  const add = (riga: RigaInput, anno: string, v: number) => {
    out[riga] = out[riga] ?? {};
    out[riga]![anno] = (out[riga]![anno] ?? 0) + v;
  };
  for (const voce of voci) {
    const dest = abbinamento[voce.chiave];
    if (!dest || dest === 'esclusa') continue;
    for (const [anno, v] of Object.entries(voce.valori)) {
      // Tutte le righe sono grandezze non negative: i costi scritti con il meno
      // (convenzione di molti piani) si prendono in valore assoluto.
      const valore = Math.abs(v) * unita;
      if (dest === 'costiProduzioneTotali')
        totaliProduzione[anno] = (totaliProduzione[anno] ?? 0) + valore;
      else add(dest, anno, valore);
    }
  }
  for (const [anno, tot] of Object.entries(totaliProduzione)) {
    const amm = out.ammortamenti?.[anno] ?? 0;
    add('costiOperativi', anno, Math.max(0, tot - amm));
  }
  for (const riga of Object.keys(out) as RigaInput[]) {
    for (const anno of Object.keys(out[riga]!))
      out[riga]![anno] = Math.round(out[riga]![anno] * 100) / 100;
  }
  return out;
}

/** Ipotesi del motore (valori assoluti) sugli anni del piano. Le righe non indicate restano vuote:
 * il motore riporta il valore dell'anno prima e il confronto le segna «non indicate». */
export function ipotesiDaPianoAzienda(
  valori: ValoriPianoAzienda,
  primoAnno: number,
  orizzonte: number
): IpotesiPiano {
  const ip: IpotesiPiano = {};
  for (const riga of RIGHE_AZIENDA) {
    const perAnno = valori[riga];
    if (!perAnno) continue;
    const arr = Array.from({ length: orizzonte }, (_, i) => {
      const v = perAnno[String(primoAnno + i)];
      return v === undefined || !Number.isFinite(v) ? null : { tipo: 'abs' as const, valore: v };
    });
    if (arr.some(Boolean)) ip[riga] = arr;
  }
  return ip;
}

/** Anni coperti dal piano dell'azienda. */
export function anniDelPiano(valori: ValoriPianoAzienda): number[] {
  const s = new Set<number>();
  for (const r of Object.values(valori)) for (const a of Object.keys(r ?? {})) s.add(Number(a));
  return [...s].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
}

/** Pulizia dei valori arrivati dal client o dall'AI. */
export function valoriPuliti(v: unknown): ValoriPianoAzienda {
  const out: ValoriPianoAzienda = {};
  if (!v || typeof v !== 'object') return out;
  for (const riga of RIGHE_AZIENDA) {
    const perAnno = (v as Record<string, unknown>)[riga];
    if (!perAnno || typeof perAnno !== 'object') continue;
    const pulito: Record<string, number> = {};
    for (const [a, n] of Object.entries(perAnno as Record<string, unknown>)) {
      const num = typeof n === 'number' ? n : numeroDaCella(n);
      if (/^20\d{2}$/.test(a) && num !== null && Number.isFinite(num) && Math.abs(num) < 1e13)
        pulito[a] = num;
    }
    if (Object.keys(pulito).length) out[riga] = pulito;
  }
  return out;
}
