// Import del file VERA (INPS "DettaglioRichiesta"): legge TUTTE le sezioni
// del foglio indicato, ognuna con la sua natura data dal TITOLO di sezione
// (l'escamotage della colonna-guida applicato al titolo). Browser-safe.
//
// v1: per la verifica certo-per-certo a livello di categoria serve, per ogni
// sezione, la somma dell'importo. La colonna importo si individua per
// etichetta ("Totale debito" → "Importo"/"Residuo" → ultima numerica); la
// voce è la prima colonna testuale. Nessuna mappatura colonna-per-colonna:
// ciò che l'operatore mappa è solo il titolo di sezione → categoria.

import {
  estraiTutteLeSezioni,
  normalizzaEtichetta,
  testoCella,
  type SezioneConTitolo,
} from './tracciatoCore';
import { leggiFoglioAoa, elencoFogli } from './tracciatoExcel';
import { parseNumero } from './tracciatoImport';

export const FOGLIO_VERA_DEFAULT = 'Dettaglio Verifica';

function indiceImporto(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  let i = norm.findIndex((h) => h === 'totale debito');
  if (i < 0) i = norm.findIndex((h) => h.includes('importo') || h.includes('residuo'));
  return i;
}

function indiceVoce(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  const i = norm.findIndex((h) => /(natura|descriz|voce|posizione|causale|gestione)/.test(h));
  return i >= 0 ? i : 0;
}

export interface SezioneVera {
  titolo: string;
  intestazioni: string[];
  idxImporto: number;
  idxVoce: number;
  numeroRighe: number;
  totale: number;
  righe: { voce: string; importo: number }[];
}

export interface AnalisiVera {
  fogli: string[];
  foglioLetto: string;
  sezioni: SezioneVera[];
  /** Titoli di sezione distinti trovati nel file (normalizzati → label originale). */
  titoli: { norm: string; label: string }[];
}

function sezioneVeraDa(s: SezioneConTitolo): SezioneVera {
  const idxImporto = indiceImporto(s.intestazioni);
  const idxVoce = indiceVoce(s.intestazioni);
  const righe = s.righe.map((r, n) => ({
    voce:
      idxVoce >= 0 && testoCella(r[idxVoce]).trim() !== ''
        ? testoCella(r[idxVoce])
        : `Riga ${n + 1}`,
    importo: idxImporto >= 0 ? parseNumero(r[idxImporto]) : 0,
  }));
  const totale = righe.reduce((a, r) => a + r.importo, 0);
  return {
    titolo: s.titolo,
    intestazioni: s.intestazioni,
    idxImporto,
    idxVoce,
    numeroRighe: righe.length,
    totale,
    righe,
  };
}

/** Analizza il file VERA: sezioni e titoli distinti. */
export async function analizzaVera(file: File, foglio?: string): Promise<AnalisiVera> {
  const fogli = await elencoFogli(file);
  const foglioScelto =
    foglio && fogli.includes(foglio)
      ? foglio
      : fogli.includes(FOGLIO_VERA_DEFAULT)
        ? FOGLIO_VERA_DEFAULT
        : fogli[0];
  const { aoa, foglioLetto } = await leggiFoglioAoa(file, foglioScelto);
  const sezioni = estraiTutteLeSezioni(aoa).map(sezioneVeraDa);
  const titoliMap = new Map<string, string>();
  for (const s of sezioni) {
    const norm = normalizzaEtichetta(s.titolo);
    if (norm && !titoliMap.has(norm)) titoliMap.set(norm, s.titolo);
  }
  return {
    fogli,
    foglioLetto,
    sezioni,
    titoli: Array.from(titoliMap.entries()).map(([norm, label]) => ({ norm, label })),
  };
}

export interface RigaVera {
  sezione: string;
  voce: string;
  importo: number;
  categoria: string;
}

/**
 * Trasforma le sezioni in righe salvabili, assegnando a ciascuna la categoria
 * mappata dal titolo. `mappaturaTitoli` è norm(titolo) → codice categoria.
 * Le sezioni con titolo non mappato vengono elencate a parte (da chiedere).
 */
export function estraiRigheVera(
  sezioni: SezioneVera[],
  mappaturaTitoli: Record<string, string>
): { righe: RigaVera[]; titoliNonMappati: { norm: string; label: string }[] } {
  const righe: RigaVera[] = [];
  const nonMappati: { norm: string; label: string }[] = [];
  const vistiNonMappati = new Set<string>();
  for (const s of sezioni) {
    const norm = normalizzaEtichetta(s.titolo);
    const categoria = mappaturaTitoli[norm];
    if (!categoria) {
      if (!vistiNonMappati.has(norm)) {
        vistiNonMappati.add(norm);
        nonMappati.push({ norm, label: s.titolo });
      }
      continue;
    }
    for (const r of s.righe) {
      righe.push({ sezione: s.titolo, voce: r.voce, importo: r.importo, categoria });
    }
  }
  return { righe, titoliNonMappati: nonMappati };
}
