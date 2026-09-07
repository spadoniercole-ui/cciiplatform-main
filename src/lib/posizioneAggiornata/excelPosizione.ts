// src/lib/posizioneAggiornata/excelPosizione.ts
//
// Export/import del prospetto Posizione Aggiornata: N colonne di
// riferimento (fino agli ultimi 5 anni dal file XBRL già caricato, non
// modificabili nel foglio ma presenti per confronto) e una colonna da
// compilare (posizione aggiornata), SEMPRE l'ultima. Interamente lato
// client, stesso principio già in uso per Check List e Proposta.
//
// L'import individua la colonna da rileggere per intestazione ("Posizione
// Aggiornata"), non per indice fisso: così il numero di colonne di
// riferimento può variare senza rompere la rilettura.

import * as XLSX from 'xlsx';
import { CAMPI_POSIZIONE, DATI_VUOTI } from './schemaCampi';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

export interface RiferimentoPeriodo {
  etichetta: string;
  dati: DatiFinanziariPeriodo;
}

const INTESTAZIONE_COMPILABILE = 'Posizione Aggiornata';

function nomeFileSicuro(testo: string): string {
  return (testo || 'posizione_aggiornata')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function esportaPosizioneExcel(
  nomeScenario: string,
  riferimenti: RiferimentoPeriodo[],
  posizioneAggiornata: DatiFinanziariPeriodo
): void {
  const numColonne = 1 + riferimenti.length + 1; // Voce + riferimenti + compilabile
  const celleVuoteSezione = Array(numColonne - 1).fill('');

  const dati: (string | number)[][] = [
    [
      `Compilare solo la colonna "${INTESTAZIONE_COMPILABILE}" (l'ultima). Le colonne di riferimento (dal file XBRL già caricato) non vanno modificate e non vengono rilette in fase di import.`,
    ],
    ['Voce', ...riferimenti.map((r) => `${r.etichetta} (XBRL)`), INTESTAZIONE_COMPILABILE],
  ];

  let gruppoAttuale: string | null = null;
  for (const campo of CAMPI_POSIZIONE) {
    if (campo.gruppo !== gruppoAttuale) {
      gruppoAttuale = campo.gruppo;
      dati.push([
        campo.gruppo === 'CE'
          ? 'CONTO ECONOMICO (a valore della produzione)'
          : 'STATO PATRIMONIALE (criterio finanziario)',
        ...celleVuoteSezione,
      ]);
    }
    dati.push([
      campo.etichetta,
      ...riferimenti.map((r) => r.dati[campo.chiave] ?? ''),
      posizioneAggiornata[campo.chiave] || '',
    ]);
  }

  const foglio = XLSX.utils.aoa_to_sheet(dati);
  foglio['!cols'] = [{ wch: 45 }, ...riferimenti.map(() => ({ wch: 18 })), { wch: 18 }];
  foglio['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numColonne - 1 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglio, 'Posizione Aggiornata');
  XLSX.writeFile(wb, `posizione_aggiornata_${nomeFileSicuro(nomeScenario)}.xlsx`);
}

export interface RisultatoImportPosizione {
  dati: DatiFinanziariPeriodo;
  righeNonRiconosciute: string[];
}

/** Rilegge SOLO la colonna "Posizione Aggiornata", individuata per
 * intestazione (non per indice fisso: le colonne di riferimento possono
 * essere 1..5), abbinando per etichetta esatta della voce (colonna 0), non
 * per posizione di riga. */
export async function importaPosizioneExcel(file: File): Promise<RisultatoImportPosizione> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const primoFoglio = wb.Sheets[wb.SheetNames[0]];
  const righeGrezze: unknown[][] = XLSX.utils.sheet_to_json(primoFoglio, {
    header: 1,
    blankrows: false,
  });

  // Individua l'indice della colonna compilabile dall'intestazione. La riga
  // di intestazione è quella che ha 'Voce' nella prima cella. Fallback:
  // ultima colonna della riga di intestazione (la compilabile è sempre in
  // coda). Ulteriore fallback storico: indice 3 (vecchio formato a 2
  // colonne di riferimento).
  let colCompilabile = 3;
  const rigaIntestazione = righeGrezze.find(
    (r) => typeof r[0] === 'string' && r[0].trim().toLowerCase() === 'voce'
  );
  if (rigaIntestazione) {
    const idx = rigaIntestazione.findIndex(
      (c) => typeof c === 'string' && c.trim() === INTESTAZIONE_COMPILABILE
    );
    colCompilabile = idx >= 0 ? idx : rigaIntestazione.length - 1;
  }

  const mappaEtichette = new Map(CAMPI_POSIZIONE.map((c) => [c.etichetta.trim(), c.chiave]));
  const dati: DatiFinanziariPeriodo = { ...DATI_VUOTI };
  const righeNonRiconosciute: string[] = [];

  for (const riga of righeGrezze) {
    const etichetta = typeof riga[0] === 'string' ? riga[0].trim() : '';
    if (!etichetta) continue;
    const chiave = mappaEtichette.get(etichetta);
    if (!chiave) continue; // riga di intestazione, istruzioni, o titolo di sezione: ignorata, non un errore
    const cella = riga[colCompilabile];
    const valore = Number(cella);
    if (!Number.isNaN(valore) && cella !== '' && cella !== undefined) {
      dati[chiave] = valore;
    }
  }

  return { dati, righeNonRiconosciute };
}
