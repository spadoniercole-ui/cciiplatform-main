// src/lib/piano/automatico.ts
//
// PIANO AUTOMATICO — il termine di paragone del piano dell'azienda (scelta
// di Ercole: colonna automatica guidata dal settore). Ipotesi dichiarate:
//   - ricavi che crescono come il settore (tasso annuo composto dalla serie
//     ISTAT del gruppo ATECO); se la serie manca, come l'azienda negli
//     ultimi esercizi; se manca anche quella, invariati;
//   - margini costanti: i costi operativi seguono i ricavi;
//   - crediti verso clienti e debiti verso fornitori proporzionali ai ricavi
//     (giorni di incasso e di pagamento invariati);
//   - investimenti di mantenimento pari agli ammortamenti dell'ultimo anno;
//   - oneri finanziari, altri ricavi e debiti verso banche invariati.
// Nessun giudizio: è la traiettoria «a settore» dell'azienda com'è oggi.

import type { EsercizioStorico, Ipotesi, IpotesiPiano, RigaInput } from './piano';

export interface PuntoSerie {
  periodo: string; // "YYYY" o "YYYY-MM" o "YYYY-Qn"
  valore: number;
}

export type FonteCrescita = 'settore' | 'azienda' | 'nessuna';

export interface CrescitaRiferimento {
  /** Tasso annuo in %, già limitato all'intervallo ammesso. */
  tasso: number;
  fonte: FonteCrescita;
  descrizione: string;
  /** Tasso prima del limite, se il limite è intervenuto. */
  tassoGrezzo?: number;
}

/** Limite prudenziale al tasso automatico: oltre, la serie non è un riferimento credibile per un'impresa singola. */
export const LIMITE_TASSO = 20;

const r2 = (n: number) => Math.round(n * 100) / 100;

function cagr(primo: number, ultimo: number, anni: number): number | null {
  if (primo <= 0 || ultimo <= 0 || anni <= 0) return null;
  return (Math.pow(ultimo / primo, 1 / anni) - 1) * 100;
}

/** Tasso annuo composto della serie ISTAT: medie annuali, dal primo all'ultimo anno disponibile. */
export function crescitaDaSerie(
  punti: PuntoSerie[]
): { tasso: number; dal: string; al: string } | null {
  const perAnno = new Map<string, number[]>();
  for (const p of punti) {
    const anno = String(p.periodo).slice(0, 4);
    if (!/^\d{4}$/.test(anno) || !Number.isFinite(p.valore)) continue;
    if (!perAnno.has(anno)) perAnno.set(anno, []);
    perAnno.get(anno)!.push(p.valore);
  }
  const anni = Array.from(perAnno.keys()).sort();
  if (anni.length < 2) return null;
  const media = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const t = cagr(
    media(perAnno.get(anni[0])!),
    media(perAnno.get(anni[anni.length - 1])!),
    Number(anni[anni.length - 1]) - Number(anni[0])
  );
  return t === null ? null : { tasso: t, dal: anni[0], al: anni[anni.length - 1] };
}

/** Tasso annuo composto dei ricavi dell'azienda sugli esercizi disponibili (storico dal più recente). */
export function crescitaAzienda(
  storico: Pick<EsercizioStorico, 'anno' | 'ricaviVendite'>[]
): { tasso: number; dal: number; al: number } | null {
  if (storico.length < 2) return null;
  const recente = storico[0];
  const vecchio = storico[storico.length - 1];
  const t = cagr(vecchio.ricaviVendite, recente.ricaviVendite, recente.anno - vecchio.anno);
  return t === null ? null : { tasso: t, dal: vecchio.anno, al: recente.anno };
}

export function crescitaDiRiferimento(
  punti: PuntoSerie[] | null,
  descrizioneSettore: string | null,
  storico: EsercizioStorico[]
): CrescitaRiferimento {
  const limita = (t: number) => Math.max(-LIMITE_TASSO, Math.min(LIMITE_TASSO, t));
  const s = punti && punti.length ? crescitaDaSerie(punti) : null;
  if (s) {
    const tasso = r2(limita(s.tasso));
    return {
      tasso,
      fonte: 'settore',
      descrizione: `Crescita annua del settore${descrizioneSettore ? ` (${descrizioneSettore})` : ''} dalla serie ISTAT ${s.dal}–${s.al}: ${tasso.toLocaleString('it-IT')}%${tasso !== r2(s.tasso) ? ` (limitata dal ${r2(s.tasso).toLocaleString('it-IT')}%)` : ''}.`,
      ...(tasso !== r2(s.tasso) ? { tassoGrezzo: r2(s.tasso) } : {}),
    };
  }
  const a = crescitaAzienda(storico);
  if (a) {
    const tasso = r2(limita(a.tasso));
    return {
      tasso,
      fonte: 'azienda',
      descrizione: `Dati ISTAT di settore non disponibili: crescita annua dei ricavi dell’azienda ${a.dal}–${a.al}, ${tasso.toLocaleString('it-IT')}%${tasso !== r2(a.tasso) ? ` (limitata dal ${r2(a.tasso).toLocaleString('it-IT')}%)` : ''}.`,
      ...(tasso !== r2(a.tasso) ? { tassoGrezzo: r2(a.tasso) } : {}),
    };
  }
  return {
    tasso: 0,
    fonte: 'nessuna',
    descrizione: 'Né dati ISTAT di settore né almeno due bilanci dell’azienda: ricavi invariati.',
  };
}

/** Ipotesi del piano automatico, stessa forma delle ipotesi dell'utente. */
export function ipotesiAutomatiche(
  storico: EsercizioStorico,
  orizzonte: number,
  tasso: number
): IpotesiPiano {
  const pct = (): Ipotesi[] =>
    Array.from({ length: orizzonte }, () => ({ tipo: 'pct' as const, valore: tasso }));
  const ip: IpotesiPiano = {};
  const conCrescita: RigaInput[] = [
    'ricaviVendite',
    'costiOperativi',
    'creditiClienti',
    'debitiFornitori',
  ];
  for (const r of conCrescita) ip[r] = pct();
  ip.investimenti = Array.from({ length: orizzonte }, () => ({
    tipo: 'abs' as const,
    valore: r2(storico.ammortamenti),
  }));
  return ip;
}
