// Orchestrazione dell'import a tracciati: compone l'edge XLSX
// (tracciatoExcel) con la logica pura (tracciatoCore). Browser-safe.
//
//  - analizzaFoglio      → per il wizard di un tracciato NUOVO
//  - riconosciTracciato  → riconoscimento robusto tra i tracciati salvati
//  - rilevaCodiciNuovi   → codici-guida mai visti, da mappare prima di importare
//  - estraiRighe         → righe pronte per il salvataggio

import {
  estraiSezione,
  trovaRigaHeaderPerEtichette,
  valoriDistintiColonna,
  normalizzaEtichetta,
  testoCella,
  indiceRuolo,
  type Aoa,
  type SezioneEstratta,
  type Tracciato,
} from './tracciatoCore';
import { elencoFogli, leggiFoglioAoa } from './tracciatoExcel';

export interface AnalisiFoglio {
  fogli: string[];
  foglioLetto: string;
  sezione: SezioneEstratta;
  /** Per ciascuna colonna reale, i valori distinti trovati nella sezione (per il preview della mappatura guida). */
  valoriDistintiPerColonna: string[][];
}

/** Analisi di un foglio per il wizard di un tracciato nuovo (header via euristica). */
export async function analizzaFoglio(file: File, foglio?: string): Promise<AnalisiFoglio> {
  const { fogli, foglioLetto, aoa } = await leggiFoglioAoa(file, foglio);
  const sezione = estraiSezione(aoa);
  const valoriDistintiPerColonna = sezione.colonneReali.map((_, k) =>
    valoriDistintiColonna(sezione.righe, k)
  );
  return { fogli, foglioLetto, sezione, valoriDistintiPerColonna };
}

export interface RiconoscimentoTracciato {
  tracciato: Tracciato;
  foglioLetto: string;
  sezione: SezioneEstratta;
}

/**
 * Prova a riconoscere il file tra i tracciati salvati. Per ciascuno apre il
 * suo foglio e cerca la riga header che combacia (normalizzata) con le
 * intestazioni salvate. Primo che combacia vince. null se nessuno.
 */
export async function riconosciTracciato(
  file: File,
  tracciati: Tracciato[]
): Promise<RiconoscimentoTracciato | null> {
  if (tracciati.length === 0) return null;
  const fogliFile = await elencoFogli(file);
  for (const t of tracciati) {
    if (!fogliFile.includes(t.foglio)) continue;
    const { aoa } = await leggiFoglioAoa(file, t.foglio);
    const atteseNorm = t.intestazioni.map(normalizzaEtichetta);
    const headerRow = trovaRigaHeaderPerEtichette(aoa, atteseNorm);
    if (headerRow < 0) continue;
    const sezione = estraiSezione(aoa, headerRow);
    return { tracciato: t, foglioLetto: t.foglio, sezione };
  }
  return null;
}

/** Colonna-guida di un tracciato = colonna reale con ruolo 'guida'. -1 se assente. */
export function indiceGuida(tracciato: Tracciato): number {
  return indiceRuolo(tracciato.ruoli, 'guida');
}

/** Codici-guida presenti nella sezione ma non ancora mappati nel tracciato. */
export function rilevaCodiciNuovi(sezione: SezioneEstratta, tracciato: Tracciato): string[] {
  if (tracciato.classificazioneModo !== 'colonna_guida') return [];
  const idx = indiceGuida(tracciato);
  if (idx < 0) return [];
  const distinti = valoriDistintiColonna(sezione.righe, idx);
  return distinti.filter((v) => !(v in tracciato.mappaturaCodici));
}

export function parseNumero(c: unknown): number {
  if (typeof c === 'number') return Number.isFinite(c) ? c : 0;
  const t = testoCella(c as never)
    .replace(/[€\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // separatore migliaia
    .replace(',', '.');
  const n = Number(t);
  return Number.isNaN(n) ? 0 : n;
}

export interface RigaImportata {
  voce: string;
  importo: number;
  importoVersato: number | null;
  /** Codice categoria (es. DEBITO/AVA/NEUTRO). */
  tipo: string;
  note: string | null;
  data: string | null;
  datiExtra: Record<string, string> | null;
  /** Codice-guida grezzo di questa riga (per ri-applicare le correzioni). null se tipo fisso. */
  codiceGuida: string | null;
}

export interface EsitoEstrazione {
  righe: RigaImportata[];
  scartate: { indice: number; motivo: string }[];
}

/**
 * Trasforma la sezione in righe salvabili applicando i ruoli e la
 * classificazione del tracciato. Le righe senza importo o senza categoria
 * risolvibile vengono scartate con motivo (mai importate a metà).
 */
export function estraiRighe(sezione: SezioneEstratta, tracciato: Tracciato): EsitoEstrazione {
  const righe: RigaImportata[] = [];
  const scartate: { indice: number; motivo: string }[] = [];
  const ruoli = tracciato.ruoli;
  const idxVoce = indiceRuolo(ruoli, 'voce');
  const idxImporto = indiceRuolo(ruoli, 'importo');
  const idxVersato = indiceRuolo(ruoli, 'importo_versato');
  const idxData = indiceRuolo(ruoli, 'data');
  const idxNota = indiceRuolo(ruoli, 'nota');
  const idxGuida = indiceGuida(tracciato);
  const idxExtra: number[] = [];
  ruoli.forEach((r, i) => {
    if (r === 'extra') idxExtra.push(i);
  });

  sezione.righe.forEach((riga, n) => {
    const importo = idxImporto >= 0 ? parseNumero(riga[idxImporto]) : NaN;
    if (idxImporto < 0 || Number.isNaN(importo)) {
      scartate.push({ indice: n, motivo: 'importo assente o non numerico' });
      return;
    }
    // Categoria
    let tipo: string | null = null;
    let codiceGuida: string | null = null;
    if (tracciato.classificazioneModo === 'tipo_fisso') {
      tipo = tracciato.tipoFisso;
    } else if (idxGuida >= 0) {
      codiceGuida = testoCella(riga[idxGuida]) || null;
      tipo = codiceGuida ? (tracciato.mappaturaCodici[codiceGuida] ?? null) : null;
    }
    if (!tipo) {
      scartate.push({ indice: n, motivo: 'categoria non risolvibile per questa riga' });
      return;
    }
    const voce =
      idxVoce >= 0 && testoCella(riga[idxVoce]).trim() !== ''
        ? testoCella(riga[idxVoce])
        : `Riga ${n + 1}`;
    const versato = idxVersato >= 0 ? parseNumero(riga[idxVersato]) : null;
    const data =
      idxData >= 0 && testoCella(riga[idxData]).trim() !== '' ? testoCella(riga[idxData]) : null;
    const note =
      idxNota >= 0 && testoCella(riga[idxNota]).trim() !== '' ? testoCella(riga[idxNota]) : null;
    const datiExtra: Record<string, string> = {};
    for (const ie of idxExtra) {
      const val = testoCella(riga[ie]);
      if (val.trim() !== '') datiExtra[sezione.intestazioni[ie] || `col${ie}`] = val;
    }
    righe.push({
      voce,
      importo,
      importoVersato: versato,
      tipo,
      note,
      data,
      datiExtra: Object.keys(datiExtra).length > 0 ? datiExtra : null,
      codiceGuida,
    });
  });

  return { righe, scartate };
}

/** Suggerimento di ruoli iniziali per il wizard, in base alle etichette. */
export function suggerisciRuoli(intestazioni: string[]): import('./tracciatoCore').RuoloColonna[] {
  return intestazioni.map((h) => {
    const n = normalizzaEtichetta(h);
    if (/(imp.*debito|importo|contributi|totale debito|iscritto|residuo)/.test(n)) return 'importo';
    if (/(vers|versato)/.test(n)) return 'importo_versato';
    if (/(data|periodo|anno)/.test(n)) return 'data';
    if (/(natura|descriz|voce|posizione|causale)/.test(n)) return 'voce';
    if (/(csl|tipo|stato lavorazione)/.test(n)) return 'guida';
    if (/(nota|note)/.test(n)) return 'nota';
    return 'ignora';
  });
}
