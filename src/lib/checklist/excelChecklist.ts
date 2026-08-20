// src/lib/checklist/excelChecklist.ts
//
// Export/import Excel della Check List, per farla compilare fuori dal
// sistema (la maggior parte delle domande è in capo all'azienda, non
// pensabile farle compilare loro direttamente qui). Interamente lato
// client (stesso principio già in uso in src/lib/xbrl/reportExport.ts):
// i dati sono già nello stato React, non serve un giro sul server per
// generare un file che poi verrebbe comunque scaricato dal browser.
//
// L'import si aggancia SEMPRE per ID domanda (colonna B), non per
// posizione di riga: se il file viene riordinato o alcune righe vengono
// cancellate, l'abbinamento resta corretto.

import * as XLSX from 'xlsx';
import type { SezioneChecklist } from './ministeriale';

export interface RispostaEsistente {
  domandaId: string;
  risposta: boolean | null;
  note: string | null;
}

const INTESTAZIONI = [
  'Sezione',
  'ID',
  'Domanda',
  'A cura di',
  'Peso',
  'Risposta',
  'Note',
  'Applicabile a questo scenario',
];

function nomeFileSicuro(testo: string): string {
  return (testo || 'checklist')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/**
 * Esporta la Check List come file Excel compilabile: una riga per
 * domanda, con le risposte già presenti precompilate (se lo si sta
 * ri-esportando per completare quanto manca) e le colonne di riferimento
 * (Sezione/ID/Domanda/A cura di/Peso) protette solo dall'istruzione nella
 * prima riga — SheetJS non gestisce la protezione delle celle in questa
 * versione, va segnalato testualmente. "Applicabile a questo scenario"
 * riflette lo stato di esclusione corrente (Sì di default, No se già
 * esclusa da sistema) — la si può cambiare qui invece che con
 * l'interruttore in pagina, stesso dato, due modi di modificarlo.
 */
export function esportaChecklistExcel(
  nomeModello: string,
  sezioni: SezioneChecklist[],
  risposte: Record<string, RispostaEsistente>,
  domandeEscluse: Set<string> = new Set()
): void {
  const righe: (string | number)[][] = [
    [
      `Compilare le colonne "Risposta" (Sì / No), "Note" e "Applicabile a questo scenario" (Sì / No — scrivere No per escludere quella domanda dal punteggio di questo scenario). Non modificare Sezione, ID, Domanda, A cura di, Peso: servono a riconoscere la domanda al momento dell'import.`,
    ],
    INTESTAZIONI,
  ];

  for (const sezione of sezioni) {
    for (const domanda of sezione.domande) {
      const esistente = risposte[domanda.id];
      const rispostaTesto =
        esistente?.risposta === true ? 'Sì' : esistente?.risposta === false ? 'No' : '';
      righe.push([
        `${sezione.numero}. ${sezione.titolo}`,
        domanda.id,
        domanda.domanda,
        domanda.aCuraDi === 'imprenditore' ? 'Imprenditore' : 'Esperto',
        domanda.peso,
        rispostaTesto,
        esistente?.note || '',
        domandeEscluse.has(domanda.id) ? 'No' : 'Sì',
      ]);
    }
  }

  const foglio = XLSX.utils.aoa_to_sheet(righe);
  foglio['!cols'] = [
    { wch: 30 },
    { wch: 8 },
    { wch: 60 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 30 },
    { wch: 16 },
  ];
  foglio['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglio, 'Check List');
  XLSX.writeFile(wb, `checklist_${nomeFileSicuro(nomeModello)}.xlsx`);
}

export interface RigaImportataChecklist {
  domandaId: string;
  risposta: boolean | null;
  note: string | null;
  esclusa: boolean;
}

export interface RisultatoParsingChecklist {
  righe: RigaImportataChecklist[];
  idNonRiconosciuti: string[];
}

/** Interpreta il testo di una cella "Risposta": accetta Sì/Si/SI/S, No/NO/N — tutto il resto è "non risposto". */
function interpretaRisposta(testo: unknown): boolean | null {
  if (typeof testo !== 'string') return null;
  const pulito = testo.trim().toLowerCase();
  if (['sì', 'si', 's'].includes(pulito)) return true;
  if (['no', 'n'].includes(pulito)) return false;
  return null;
}

/** "Applicabile a questo scenario": No = esclusa. Vuoto o non riconosciuto = applicabile (non esclusa) — un default permissivo, non silenziosamente escludente. */
function interpretaApplicabile(testo: unknown): boolean {
  if (typeof testo !== 'string') return true;
  const pulito = testo.trim().toLowerCase();
  return !['no', 'n'].includes(pulito);
}

/**
 * Legge un file Excel compilato e ne estrae le risposte, abbinando per
 * ID domanda (colonna B). Righe con ID non presente tra le domande
 * fornite vengono segnalate, non silenziosamente scartate.
 */
export async function importaChecklistExcel(
  file: File,
  sezioni: SezioneChecklist[]
): Promise<RisultatoParsingChecklist> {
  const idValidi = new Set(sezioni.flatMap((s) => s.domande.map((d) => d.id)));

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const primoFoglio = wb.Sheets[wb.SheetNames[0]];
  const righeGrezze: unknown[][] = XLSX.utils.sheet_to_json(primoFoglio, {
    header: 1,
    blankrows: false,
  });

  const righe: RigaImportataChecklist[] = [];
  const idNonRiconosciuti: string[] = [];

  // Salta le prime due righe (istruzioni + intestazioni); tollera anche
  // file dove l'utente ha cancellato la riga di istruzioni.
  for (const riga of righeGrezze) {
    const idCella = riga[1];
    if (typeof idCella !== 'string' || !idCella.trim()) continue;
    const domandaId = idCella.trim();
    if (domandaId === 'ID') continue; // riga di intestazione

    if (!idValidi.has(domandaId)) {
      idNonRiconosciuti.push(domandaId);
      continue;
    }

    const risposta = interpretaRisposta(riga[5]);
    const note = typeof riga[6] === 'string' && riga[6].trim() ? riga[6].trim() : null;
    const esclusa = !interpretaApplicabile(riga[7]);
    if (risposta === null && !note && !esclusa) continue; // riga non compilata: non tocca nulla

    righe.push({ domandaId, risposta, note, esclusa });
  }

  return { righe, idNonRiconosciuti };
}
