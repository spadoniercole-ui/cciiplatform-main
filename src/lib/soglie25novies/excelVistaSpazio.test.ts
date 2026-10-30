// Verifica che il foglio scaricato abbia la forma della vista — una riga per
// azienda, una colonna per esercizio — e che i dati mancanti restino celle
// vuote: uno zero al posto di un rapporto non calcolabile o di un ritardo mai
// misurato sarebbe una conclusione, non un dato.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const catturati: { wb: XLSX.WorkBook; nome: string }[] = [];

vi.mock('xlsx', async (originale) => {
  const vero = await originale<typeof import('xlsx')>();
  return {
    ...vero,
    writeFile: (wb: XLSX.WorkBook, nome: string) => {
      catturati.push({ wb, nome });
    },
  };
});

import { esportaVistaContributiExcel } from './excelVistaSpazio';
import { vistaContributiSpazio } from './vistaSpazio';

const righe = vistaContributiSpazio([
  {
    aziendaId: 1,
    ragioneSociale: 'ARETUSEA S.R.L.',
    anni: [
      { anno: 2023, dovuti: 50_840, scaduti: 15_200, oltre90: 15_200 },
      { anno: 2024, dovuti: 41_820, scaduti: 17_000, oltre90: 17_000 },
      { anno: 2025, dovuti: null, scaduti: 44_471, oltre90: null },
    ],
    origine: 'file',
    ricostruitaIl: null,
  },
  {
    aziendaId: 2,
    ragioneSociale: 'RICOSTRUITA S.N.C.',
    anni: [{ anno: 2025, dovuti: 50_000, scaduti: 20_000 }],
    origine: 'posizioni',
    ricostruitaIl: '2026-03-14',
  },
]);

const cella = (foglio: XLSX.WorkSheet, r: number, c: number) =>
  foglio[XLSX.utils.encode_cell({ r, c })];

beforeEach(() => {
  catturati.length = 0;
});

describe('esportaVistaContributiExcel', () => {
  it('intestazione con un anno per colonna e le colonne di sintesi', () => {
    esportaVistaContributiExcel('spazio demo', righe);
    const { wb, nome } = catturati[catturati.length - 1];
    expect(nome).toBe('contributi_per_anno_spazio_demo.xlsx');
    expect(wb.SheetNames).toEqual(['Contributi per anno']);

    const foglio = wb.Sheets['Contributi per anno'];
    const intestazione = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => cella(foglio, 1, c)?.v);
    expect(intestazione).toEqual([
      'Azienda',
      '2023',
      '2024',
      '2025',
      'Variazione (punti)',
      'Oltre 90 giorni (€)',
      'Esercizi con ritardo',
      'Fonte',
    ]);
  });

  it('scrive le quote come percentuali e lascia vuoto l’anno non calcolabile', () => {
    esportaVistaContributiExcel('spazio demo', righe);
    const foglio = catturati[catturati.length - 1].wb.Sheets['Contributi per anno'];

    expect(cella(foglio, 2, 0)?.v).toBe('ARETUSEA S.R.L.');
    expect(cella(foglio, 2, 1)?.v).toBeCloseTo(15_200 / 50_840, 6);
    expect(cella(foglio, 2, 1)?.z).toBe('0.0%');
    // 2025 ha il dovuto nullo: rapporto non calcolabile, quindi cella vuota.
    expect(cella(foglio, 2, 3)?.v ?? '').toBe('');
    expect(cella(foglio, 2, 4)?.v).toBeCloseTo(10.8, 1);
    expect(cella(foglio, 2, 5)?.v).toBe(32_200);
    expect(cella(foglio, 2, 6)?.v).toBe('2023, 2024');
    expect(cella(foglio, 2, 7)?.v).toBe('DM10 / inadempienze');
  });

  it('il ritardo non misurato resta vuoto e la fonte dichiara la ricostruzione', () => {
    esportaVistaContributiExcel('spazio demo', righe);
    const foglio = catturati[catturati.length - 1].wb.Sheets['Contributi per anno'];

    expect(cella(foglio, 3, 5)?.v ?? '').toBe('');
    expect(cella(foglio, 3, 6)?.v ?? '').toBe('');
    expect(cella(foglio, 3, 7)?.v).toBe('posizioni triage · 14/03/2026');
    expect(cella(foglio, 3, 8)?.v).toBe('2026-03-14');
  });

  it('la nota in testa dichiara che le celle vuote non sono zeri', () => {
    esportaVistaContributiExcel('spazio demo', righe);
    const foglio = catturati[catturati.length - 1].wb.Sheets['Contributi per anno'];
    const nota = String(cella(foglio, 0, 0)?.v ?? '');
    expect(nota).toContain('La cella vuota non è zero');
    expect(nota).toContain('15.000 €');
  });

  it('mantiene l’ordine della vista', () => {
    esportaVistaContributiExcel('spazio demo', righe);
    const foglio = catturati[catturati.length - 1].wb.Sheets['Contributi per anno'];
    expect(cella(foglio, 2, 0)?.v).toBe('ARETUSEA S.R.L.');
    expect(cella(foglio, 3, 0)?.v).toBe('RICOSTRUITA S.N.C.');
  });
});
