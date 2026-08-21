// Edge XLSX del sistema tracciati: converte un File Excel (.xls o .xlsx —
// SheetJS legge entrambi) nella matrice di celle (AOA) su cui lavora la
// logica pura di tracciatoCore. Browser-safe: gira dentro il componente
// client, come già faceva il vecchio percorso architrave.

import * as XLSX from 'xlsx';
import type { Aoa } from './tracciatoCore';

async function bufferDa(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export interface FoglioLetto {
  fogli: string[];
  foglioLetto: string;
  aoa: Aoa;
}

/** Elenco dei nomi foglio del file. */
export async function elencoFogli(file: File): Promise<string[]> {
  const buf = await bufferDa(file);
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return wb.SheetNames;
}

/**
 * Legge un foglio come AOA. Le date arrivano come oggetti Date (cellDates),
 * le celle vuote come null. Se `foglio` non è indicato o non esiste, legge il
 * primo — ma dichiara sempre quale ha letto in `foglioLetto`.
 */
export async function leggiFoglioAoa(file: File, foglio?: string): Promise<FoglioLetto> {
  const buf = await bufferDa(file);
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const fogli = wb.SheetNames;
  const foglioLetto = foglio && fogli.includes(foglio) ? foglio : fogli[0];
  const ws = wb.Sheets[foglioLetto];
  const aoa = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  }) as Aoa;
  return { fogli, foglioLetto, aoa };
}
