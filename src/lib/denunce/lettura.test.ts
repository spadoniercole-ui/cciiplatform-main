import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { leggiElencoDenunce, leggiListaInadempienze } from './lettura';

// I fogli veri scrivono il periodo in una cella di DATA, non in una stringa.
// Qui si costruisce un file con la stessa forma e lo si rilegge: è il caso
// che faceva sembrare vuoto l'Elenco denunce.

async function fileDaAoa(aoa: unknown[][], nome: string): Promise<File> {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Foglio1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], nome);
}

describe('leggiElencoDenunce', () => {
  it('legge i periodi scritti come date di Excel', async () => {
    const file = await fileDaAoa(
      [
        ['Periodo comp.', 'Data present.', 'Saldo'],
        [new Date(Date.UTC(2024, 8, 1)), '18/10/2024', 11_332],
        [new Date(Date.UTC(2024, 9, 1)), '18/11/2024', 12_000],
      ],
      'denunce.xlsx'
    );
    const r = await leggiElencoDenunce(file);
    expect(r.colonneMancanti).toBeUndefined();
    expect(r.righe.map((x) => x.periodo)).toEqual(['09/2024', '10/2024']);
    expect(r.righe.map((x) => x.saldo)).toEqual([11_332, 12_000]);
    expect(r.righeNonInterpretate).toBeUndefined();
  });

  it('dichiara le righe con un periodo illeggibile invece di scartarle in silenzio', async () => {
    const file = await fileDaAoa(
      [
        ['Periodo comp.', 'Data present.', 'Saldo'],
        ['nd', '18/10/2024', 11_332],
        ['', '', ''],
        ['?', '18/11/2024', 12_000],
      ],
      'denunce.xlsx'
    );
    const r = await leggiElencoDenunce(file);
    expect(r.righe).toEqual([]);
    // La riga vuota non è un periodo illeggibile: non c'era nulla da leggere.
    expect(r.righeNonInterpretate).toBe(2);
  });
});

describe('leggiListaInadempienze', () => {
  it('legge i periodi come date e li scrive AAAA/MM', async () => {
    const file = await fileDaAoa(
      [
        ['Inizio Periodo', 'Fine Periodo', 'Importo Addebitato', 'Importo Accreditato'],
        [new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2024, 0, 1)), 1_000, 0],
      ],
      'inadempienze.xlsx'
    );
    const r = await leggiListaInadempienze(file);
    expect(r.righe).toHaveLength(1);
    expect(r.righe[0].inizioPeriodo).toBe('2024/01');
    expect(r.righe[0].finePeriodo).toBe('2024/01');
  });
});
