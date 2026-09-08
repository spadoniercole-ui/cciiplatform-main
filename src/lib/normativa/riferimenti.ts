// src/lib/normativa/riferimenti.ts
//
// Collegamento contestuale dai report alla Normativa. Due meccanismi:
//   1) segmentaConNormativa(testo): riconosce nel testo libero le citazioni
//      del tipo «art. 25-novies», «articolo 12», «art. 63 CCII» e le spezza
//      in segmenti, marcando come link SOLO gli articoli effettivamente
//      presenti in ARTICOLI (così il link porta sempre a qualcosa).
//   2) RIFERIMENTI_SCREENING: gli articoli piu pertinenti a un report di
//      screening/posizione debitoria, per una barra di rimandi rapidi.

import { ARTICOLI } from './dati';

const NUMERI_NOTI = new Set(ARTICOLI.map((a) => a.numero));

/** URL della Normativa aperta su un articolo specifico. */
export function linkNormativaArticolo(codice: string, numero: string): string {
  return `/spazio/${codice}/normativa?art=${encodeURIComponent(numero)}`;
}

/** URL della Normativa aperta su una voce di glossario. */
export function linkNormativaGlossario(codice: string, termine: string): string {
  return `/spazio/${codice}/normativa?voce=${encodeURIComponent(termine)}`;
}

const SUFFISSI = 'bis|ter|quater|quinquies|sexies|septies|octies|novies|decies';
// «art.» / «articolo» + numero + eventuale suffisso ordinale (con spazio o trattino).
const RE_CITAZIONE = new RegExp(`\\bart(?:icolo)?\\.?\\s*(\\d+)(?:[\\s-]*(${SUFFISSI}))?`, 'gi');

/** Normalizza «25 novies» / «25-Novies» -> «25-novies». */
function normalizzaNumero(base: string, suffisso?: string): string {
  return suffisso ? `${base}-${suffisso.toLowerCase()}` : base;
}

export interface SegmentoNormativa {
  tipo: 'testo' | 'link';
  valore: string;
  numero?: string;
}

/**
 * Spezza il testo in segmenti, marcando come 'link' le citazioni di articoli
 * noti. Non modifica il testo: la porzione riconosciuta resta identica.
 */
export function segmentaConNormativa(testo: string): SegmentoNormativa[] {
  if (!testo) return [{ tipo: 'testo', valore: '' }];
  const segmenti: SegmentoNormativa[] = [];
  let ultimo = 0;
  RE_CITAZIONE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_CITAZIONE.exec(testo)) !== null) {
    const numero = normalizzaNumero(m[1], m[2]);
    if (!NUMERI_NOTI.has(numero)) continue; // solo articoli che possiamo aprire
    if (m.index > ultimo) {
      segmenti.push({ tipo: 'testo', valore: testo.slice(ultimo, m.index) });
    }
    segmenti.push({ tipo: 'link', valore: m[0], numero });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < testo.length) {
    segmenti.push({ tipo: 'testo', valore: testo.slice(ultimo) });
  }
  return segmenti.length ? segmenti : [{ tipo: 'testo', valore: testo }];
}

/** Articoli piu pertinenti a un report di screening / posizione debitoria. */
export const RIFERIMENTI_SCREENING: { numero: string; etichetta: string }[] = [
  { numero: '25-novies', etichetta: 'Segnalazioni creditori pubblici (INPS, INAIL, AdE)' },
  { numero: '12', etichetta: 'Composizione negoziata' },
  { numero: '3', etichetta: 'Adeguatezza assetti e indicatori' },
  { numero: '2', etichetta: 'Definizioni: crisi e insolvenza' },
  { numero: '63', etichetta: 'Transazione fiscale e contributiva' },
];
