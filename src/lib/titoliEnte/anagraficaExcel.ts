// src/lib/titoliEnte/anagraficaExcel.ts
//
// Legge l'anagrafica dei codici dell'ente da un Excel con due colonne
// (Codice, Descrizione), come il file che l'INPS ha fornito. Gira nel browser.

import * as XLSX from 'xlsx';

export interface CodiceAnagrafica {
  codice: string;
  descrizione: string;
}

export async function leggiCodiciDaExcel(file: File): Promise<CodiceAnagrafica[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const righe = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const codici: CodiceAnagrafica[] = [];
  for (const r of righe) {
    const chiavi = Object.keys(r);
    const kCod = chiavi.find((k) => /^cod/i.test(k.trim())) ?? chiavi[0];
    const kDes = chiavi.find((k) => /^desc/i.test(k.trim())) ?? chiavi[1];
    const codice = String(r[kCod] ?? '').trim();
    const descrizione = String(r[kDes] ?? '').trim();
    if (codice && descrizione) codici.push({ codice, descrizione });
  }
  return codici;
}
