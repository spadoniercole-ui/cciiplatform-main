// src/lib/bilancino/lettura.ts
//
// Lettura di un bilancino di verifica in formato libero: ogni software
// contabile esporta con colonne diverse (codice sì o no, dare e avere
// separati o un solo saldo, segno sì o no, più periodi affiancati). Qui si
// riconoscono le colonne e si estraggono i conti; la scelta resta
// modificabile dall'operatore e si memorizza nel tracciato.
//
// Funzioni pure: le righe arrivano già lette dal foglio (array di celle).

import { normalizzaTesto } from './categorie';

/** Come leggere il segno degli importi. */
export type ModoImporti =
  | 'dare_avere' // due colonne: dare e avere
  | 'saldo_dare_positivo' // un saldo con segno, positivo = dare
  | 'saldo_avere_positivo' // un saldo con segno, positivo = avere
  | 'saldo_senza_segno'; // importi tutti positivi: il lato lo decide la categoria

export interface ColonneBilancino {
  /** Indice della riga di intestazione (-1 = nessuna intestazione). */
  rigaIntestazione: number;
  codice: number | null;
  descrizione: number;
  dare: number | null;
  avere: number | null;
  saldo: number | null;
  modo: ModoImporti;
}

export interface ContoLetto {
  /** Chiave stabile per la memoria del tracciato: codice se presente, altrimenti descrizione normalizzata. */
  chiave: string;
  codice: string | null;
  descrizione: string;
  /** Saldo convenzionale dare − avere. In modo «senza segno» è l'importo letto (≥ 0). */
  saldo: number;
  /** Numero di riga nel foglio (1 = prima riga), per ritrovarlo. */
  riga: number;
}

export const ETICHETTE_MODO: Record<ModoImporti, string> = {
  dare_avere: 'Colonne Dare e Avere separate',
  saldo_dare_positivo: 'Un saldo con segno (positivo = dare)',
  saldo_avere_positivo: 'Un saldo con segno (positivo = avere)',
  saldo_senza_segno: 'Importi senza segno (il lato lo decide la categoria)',
};

/** Converte una cella in numero: accetta 1.234,56 / 1,234.56 / (1.234) / -1.234 / «1.234 D» / «1.234 A». */
export function numeroDaCella(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s || s === '-' || s === '—') return null;
  let segno = 1;
  const suffisso = s.match(/\s*([DA])$/i);
  if (suffisso) {
    if (suffisso[1].toUpperCase() === 'A') segno = -1;
    s = s.slice(0, -suffisso[0].length);
  }
  if (/^\(.*\)$/.test(s)) {
    segno *= -1;
    s = s.slice(1, -1);
  }
  s = s.replace(/[€\s]/g, '');
  if (s.endsWith('-')) {
    segno *= -1;
    s = s.slice(0, -1);
  }
  if (!/^[-+]?[\d.,]+$/.test(s)) return null;
  const ultimaVirgola = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  if (ultimaVirgola > ultimoPunto) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ultimoPunto > ultimaVirgola && ultimaVirgola >= 0) {
    s = s.replace(/,/g, '');
  } else if (ultimoPunto >= 0 && ultimaVirgola < 0) {
    // Solo punti: separatore delle migliaia se ci sono più punti o gruppi da 3 cifre esatti.
    const parti = s.replace(/^[-+]/, '').split('.');
    if (parti.length > 2 || (parti.length === 2 && parti[1].length === 3)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? segno * n : null;
}

function testo(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

const RX_CODICE =
  /^(cod(ice)?|conto n|n\.? ?conto|n°|numero|sottoconto|mastro|cod\. conto|codice conto)\b/;
const RX_DESCRIZIONE = /(descr|denominaz|voce|conto|ragione sociale|nome)/;
const RX_DARE = /^(dare|addebit|debit|movimenti dare|saldo dare|tot\.? dare|totale dare)\b|\bdare$/;
const RX_AVERE =
  /^(avere|accredit|credit|movimenti avere|saldo avere|tot\.? avere|totale avere)\b|\bavere$/;
const RX_SALDO = /(saldo|importo|valore|progressivo|consuntivo|al \d|\d{4}$|euro|€)/;

/** Firma dell'intestazione: identifica il tracciato del software che ha esportato il file. */
export function firmaIntestazione(righe: unknown[][], rigaIntestazione: number): string {
  if (rigaIntestazione < 0) return 'senza-intestazione';
  return (righe[rigaIntestazione] || [])
    .map((c) =>
      normalizzaTesto(testo(c)).replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\b\d{4}\b/g, '#')
    )
    .join('|')
    .replace(/\|+$/, '');
}

function isCodiceConto(v: unknown): boolean {
  const s = testo(v);
  return /^[A-Z0-9]{1,4}([.\-/ ]?[A-Z0-9]{1,6}){0,4}$/i.test(s) && /\d/.test(s) && s.length <= 20;
}

/** Riconosce le colonne. Nessuna eccezione: nel peggiore dei casi propone
 * la colonna più «testuale» come descrizione e l'ultima numerica come saldo. */
export function riconosciColonne(righe: unknown[][]): ColonneBilancino {
  const limite = Math.min(righe.length, 40);
  // Riga di intestazione: la prima con almeno due celle testuali riconoscibili.
  let rigaIntestazione = -1;
  for (let r = 0; r < limite; r++) {
    const celle = (righe[r] || []).map((c) => normalizzaTesto(testo(c)));
    const riconosciute = celle.filter(
      (c) =>
        c &&
        (RX_CODICE.test(c) ||
          RX_DESCRIZIONE.test(c) ||
          RX_DARE.test(c) ||
          RX_AVERE.test(c) ||
          RX_SALDO.test(c))
    ).length;
    const numeriche = (righe[r] || []).filter((c) => typeof c === 'number').length;
    if (riconosciute >= 2 && numeriche === 0) {
      rigaIntestazione = r;
      break;
    }
  }

  const corpo = righe.slice(rigaIntestazione + 1, rigaIntestazione + 1 + 300);
  const numColonne = Math.max(0, ...righe.slice(0, 300).map((r) => (r || []).length));
  const statistiche = Array.from({ length: numColonne }, (_, c) => {
    let numeri = 0;
    let testi = 0;
    let lunghezzaTesti = 0;
    let codici = 0;
    let negativi = 0;
    for (const riga of corpo) {
      const v = (riga || [])[c];
      if (v === null || v === undefined || testo(v) === '') continue;
      const n = numeroDaCella(v);
      if (isCodiceConto(v) && typeof v === 'string') codici++;
      if (n !== null && !(typeof v === 'string' && isCodiceConto(v) && !/[.,]\d{2}$/.test(v))) {
        numeri++;
        if (n < 0) negativi++;
      } else {
        testi++;
        lunghezzaTesti += testo(v).length;
      }
    }
    return { numeri, testi, mediaTesto: testi ? lunghezzaTesti / testi : 0, codici, negativi };
  });

  const intest =
    rigaIntestazione >= 0
      ? (righe[rigaIntestazione] || []).map((c) => normalizzaTesto(testo(c)))
      : [];
  const trova = (rx: RegExp, filtro: (c: number) => boolean) => {
    for (let c = 0; c < numColonne; c++) if (intest[c] && rx.test(intest[c]) && filtro(c)) return c;
    return null;
  };
  const numerica = (c: number) => statistiche[c].numeri >= statistiche[c].testi;
  const testuale = (c: number) => statistiche[c].testi > statistiche[c].numeri;

  let codice = trova(RX_CODICE, () => true);
  let descrizione = trova(RX_DESCRIZIONE, (c) => testuale(c) && c !== codice);
  const dare = trova(RX_DARE, numerica);
  const avere = trova(RX_AVERE, numerica);
  let saldo: number | null = null;
  // Saldo: l'ultima colonna numerica con intestazione da saldo, altrimenti l'ultima numerica non dare/avere.
  for (let c = numColonne - 1; c >= 0; c--) {
    if (c === dare || c === avere || c === codice) continue;
    if (numerica(c) && statistiche[c].numeri > 0 && (intest[c] ? RX_SALDO.test(intest[c]) : true)) {
      saldo = c;
      break;
    }
  }
  if (saldo === null) {
    for (let c = numColonne - 1; c >= 0; c--) {
      if (c === dare || c === avere || c === codice) continue;
      if (numerica(c) && statistiche[c].numeri > 0) {
        saldo = c;
        break;
      }
    }
  }
  if (descrizione === null) {
    let migliore = -1;
    for (let c = 0; c < numColonne; c++) {
      if (c === codice) continue;
      if (
        testuale(c) &&
        (migliore < 0 || statistiche[c].mediaTesto > statistiche[migliore].mediaTesto)
      )
        migliore = c;
    }
    descrizione = migliore >= 0 ? migliore : 0;
  }
  if (codice === null) {
    for (let c = 0; c < numColonne; c++) {
      if (c === descrizione) continue;
      const s = statistiche[c];
      if (s.codici > 0 && s.codici >= 0.6 * (s.numeri + s.testi)) {
        codice = c;
        break;
      }
    }
  }

  let modo: ModoImporti;
  if (dare !== null && avere !== null) modo = 'dare_avere';
  else if (saldo !== null && statistiche[saldo].negativi > 0) modo = 'saldo_dare_positivo';
  else modo = 'saldo_senza_segno';

  return {
    rigaIntestazione,
    codice,
    descrizione,
    dare: modo === 'dare_avere' ? dare : null,
    avere: modo === 'dare_avere' ? avere : null,
    saldo: modo === 'dare_avere' ? null : saldo,
    modo,
  };
}

/** Estrae i conti. Si saltano le righe senza descrizione o senza alcun importo. */
export function estraiConti(righe: unknown[][], col: ColonneBilancino): ContoLetto[] {
  const conti: ContoLetto[] = [];
  const chiaviViste = new Map<string, number>();
  for (let r = col.rigaIntestazione + 1; r < righe.length; r++) {
    const riga = righe[r] || [];
    const descrizione = testo(riga[col.descrizione]);
    if (!descrizione) continue;
    let saldo: number | null;
    if (col.modo === 'dare_avere') {
      const d = col.dare !== null ? numeroDaCella(riga[col.dare]) : null;
      const a = col.avere !== null ? numeroDaCella(riga[col.avere]) : null;
      if (d === null && a === null) continue;
      saldo = (d ?? 0) - (a ?? 0);
    } else {
      const v = col.saldo !== null ? numeroDaCella(riga[col.saldo]) : null;
      if (v === null) continue;
      saldo =
        col.modo === 'saldo_avere_positivo'
          ? -v
          : col.modo === 'saldo_senza_segno'
            ? Math.abs(v)
            : v;
    }
    const codice = col.codice !== null ? testo(riga[col.codice]) || null : null;
    let chiave = codice ? `c:${codice}` : `d:${normalizzaTesto(descrizione)}`;
    // Chiavi ripetute (stessa descrizione in sezioni diverse): si rendono uniche per ordine.
    const n = (chiaviViste.get(chiave) ?? 0) + 1;
    chiaviViste.set(chiave, n);
    if (n > 1) chiave = `${chiave}#${n}`;
    conti.push({ chiave, codice, descrizione, saldo: Math.round(saldo * 100) / 100, riga: r + 1 });
  }
  return conti;
}

/** Suggerisce l'orientamento del saldo con segno guardando i conti di ricavo:
 * se sono per lo più negativi, il file usa «positivo = dare». */
export function suggerisciOrientamento(
  conti: { descrizione: string; saldo: number }[]
): 'saldo_dare_positivo' | 'saldo_avere_positivo' | null {
  let neg = 0;
  let pos = 0;
  for (const c of conti) {
    const d = normalizzaTesto(c.descrizione);
    if (/\b(ricavi|vendite|fornitori|capitale sociale)\b/.test(d)) {
      if (c.saldo < 0) neg++;
      else if (c.saldo > 0) pos++;
    }
  }
  if (neg + pos === 0) return null;
  return neg >= pos ? 'saldo_dare_positivo' : 'saldo_avere_positivo';
}

/** Data di riferimento letta dal titolo del foglio o dal nome del file
 * («Bilancio di verifica al 30/06/2026», «bilancino_31-03-2026.xlsx»). */
export function dataDiRiferimento(righe: unknown[][], nomeFile = ''): string | null {
  const fonti = [
    ...righe
      .slice(0, 8)
      .flat()
      .map((c) => testo(c)),
    nomeFile,
  ];
  for (const f of fonti) {
    const m = f.match(/(?<!\d)(\d{1,2})[/.\-_](\d{1,2})[/.\-_](\d{4})(?!\d)/);
    if (m) {
      const [g, me, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (g >= 1 && g <= 31 && me >= 1 && me <= 12 && a >= 2000 && a <= 2100) {
        return `${a}-${String(me).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
      }
    }
  }
  return null;
}
