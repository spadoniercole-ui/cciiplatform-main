// src/lib/xbrl/indiciVisibili.ts
//
// QUALI INDICI MOSTRARE, dato il catalogo dei parametri dello spazio.
//
// Il motore calcola 9 indici in due liste separate: i 5 CNDCEC in `indici` e i
// 4 di lettura economico-finanziaria in `altriIndici` (src/lib/xbrl/indici.ts).
// Le tabelle filtravano solo la prima lista per i codici abilitati: ogni indice
// abilitato oltre i primi cinque (ROE, ROI, ROT-ATT, INC-DEB) spariva dalla
// tabella senza dire nulla, e sembrava che i parametri non avessero effetto.
//
// Qui le due liste si leggono insieme. E gli indicatori che il solo bilancio
// non basta a calcolare — il DSCR, che ha bisogno del servizio del debito —
// compaiono dichiarati con il motivo, invece di mancare: un indice assente
// senza spiegazione fa pensare a un guasto, uno «n/d» con la ragione è un dato.
//
// Logica pura, con i suoi test.

import type { IndiceCcii } from './types';

export interface IndiceDichiarato {
  codice: string;
  nome: string;
  soglia: string;
  motivo: string;
}

/**
 * Indicatori del CCII che non si calcolano da un bilancio depositato.
 *
 * Il DSCR mette al numeratore il flusso di cassa disponibile e al denominatore
 * la rata (quota capitale + interessi in scadenza): la rata non è una voce di
 * bilancio. Si calcola sugli scenari, dove il piano di rientro la definisce.
 * Il test pratico ha la stessa natura (dipende dalla composizione del debito e
 * dal tempo di rientro, non dal solo deposito).
 */
export const INDICI_NON_CALCOLABILI_DAL_BILANCIO: IndiceDichiarato[] = [
  {
    codice: 'DSCR',
    nome: 'DSCR — Debt Service Coverage Ratio (flusso di cassa / servizio del debito)',
    soglia: '> 1.00',
    motivo:
      'Il bilancio depositato non espone la rata: senza quota capitale e interessi in scadenza il DSCR non è calcolabile. Si legge negli scenari, dove esiste il piano di rientro.',
  },
  {
    codice: 'TEST-PRATICO',
    nome: 'Test pratico per la verifica della ragionevole perseguibilità del risanamento',
    soglia: 'informativo',
    motivo:
      'Dipende dal tempo di rientro del debito e dalla composizione dello stesso, non dalle sole voci di bilancio: si legge sugli scenari.',
  },
];

export interface RigaIndice {
  codice: string;
  nome: string;
  soglia: string;
  /** Valorizzato quando il solo bilancio non basta a calcolarlo. */
  motivoNonCalcolabile?: string;
}

/**
 * Le righe da mostrare: gli indici abilitati che il motore calcola, cercati in
 * entrambe le liste, nell'ordine del catalogo. Un codice abilitato che non è
 * calcolabile ma è dichiarato sopra resta in tabella come «n/d» con il motivo;
 * un codice sconosciuto viene ignorato (non si inventa una riga).
 */
export function indiciVisibili(
  codiciAbilitati: string[],
  indici: IndiceCcii[],
  altriIndici: IndiceCcii[] = []
): RigaIndice[] {
  const catalogo = [...indici, ...altriIndici];
  const codici = codiciAbilitati.length > 0 ? codiciAbilitati : catalogo.map((i) => i.codice);
  const righe: RigaIndice[] = [];
  const visti = new Set<string>();

  for (const codice of codici) {
    if (visti.has(codice)) continue;
    const calcolato = catalogo.find((i) => i.codice === codice);
    if (calcolato) {
      righe.push({ codice: calcolato.codice, nome: calcolato.nome, soglia: calcolato.soglia });
      visti.add(codice);
      continue;
    }
    const dichiarato = INDICI_NON_CALCOLABILI_DAL_BILANCIO.find((i) => i.codice === codice);
    if (dichiarato) {
      righe.push({ ...dichiarato, motivoNonCalcolabile: dichiarato.motivo });
      visti.add(codice);
    }
  }

  return righe;
}

/** Il valore di un indice in una colonna, cercandolo in entrambe le liste. */
export function valoreIndice(
  colonna: { indici: IndiceCcii[]; altriIndici?: IndiceCcii[] },
  codice: string
): IndiceCcii | undefined {
  return (
    colonna.indici.find((i) => i.codice === codice) ??
    colonna.altriIndici?.find((i) => i.codice === codice)
  );
}
