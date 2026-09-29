// Verifica di andata e ritorno (export → file .xlsx → import) sulla build
// SheetJS in uso (0.20.x da cdn.sheetjs.com). XLSX.writeFile viene
// intercettato per catturare il workbook che nel browser verrebbe scaricato;
// lo si serializza come farebbe Excel e lo si rilegge con le funzioni di
// import dei moduli, così un cambio di versione che rompa lettura o
// scrittura fa fallire la CI.

import { describe, expect, it, vi, beforeEach } from 'vitest';
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

import { esportaChecklistExcel, importaChecklistExcel } from '@/lib/checklist/excelChecklist';
import { esportaPropostaExcel, importaPropostaExcel } from '@/lib/proposta/excelProposta';
import {
  esportaPosizioneExcel,
  importaPosizioneExcel,
} from '@/lib/posizioneAggiornata/excelPosizione';
import { importaDebitiEnteExcel } from '@/lib/debitiEnte/excelDebitiEnte';
import { leggiFoglioAoa } from '@/lib/debitiEnte/tracciatoExcel';
import { testoCella } from '@/lib/debitiEnte/tracciatoCore';
import { CAMPI_POSIZIONE, DATI_VUOTI } from '@/lib/posizioneAggiornata/schemaCampi';
import type { SezioneChecklist } from '@/lib/checklist/ministeriale';

function comeFile(wb: XLSX.WorkBook, nome: string): File {
  const byte = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([byte], nome);
}

function ultimoFile(): File {
  const ultimo = catturati[catturati.length - 1];
  return comeFile(ultimo.wb, ultimo.nome);
}

beforeEach(() => {
  catturati.length = 0;
});

describe('SheetJS', () => {
  it('è la build 0.20.x (non la 0.18.5 vulnerabile di npm)', () => {
    expect(XLSX.version).toMatch(/^0\.20\./);
  });
});

describe('Check List: export e re-import', () => {
  const sezioni: SezioneChecklist[] = [
    {
      numero: '1',
      titolo: 'Organizzazione',
      domande: [
        { id: '1.1', aCuraDi: 'imprenditore', peso: 'STRUTTURALE', domanda: 'Domanda uno?' },
        { id: '1.2', aCuraDi: 'esperto', peso: 'DOCUMENTALE', domanda: 'Domanda due?' },
        { id: '1.3', aCuraDi: 'esperto', peso: 'DOCUMENTALE', domanda: 'Domanda tre?' },
      ],
    },
  ];

  it('rilegge risposte, note ed esclusioni con accenti', async () => {
    esportaChecklistExcel(
      'Modello già compilato',
      sezioni,
      {
        '1.1': { domandaId: '1.1', risposta: true, note: 'Verificato città' },
        '1.2': { domandaId: '1.2', risposta: false, note: null },
      },
      new Set(['1.3'])
    );
    expect(catturati[0].nome).toBe('checklist_modello_gia_compilato.xlsx');

    const risultato = await importaChecklistExcel(ultimoFile(), sezioni);
    expect(risultato.idNonRiconosciuti).toEqual([]);
    expect(risultato.righe).toEqual([
      { domandaId: '1.1', risposta: true, note: 'Verificato città', esclusa: false },
      { domandaId: '1.2', risposta: false, note: null, esclusa: false },
      { domandaId: '1.3', risposta: null, note: null, esclusa: true },
    ]);
  });
});

describe('Proposta: export e re-import', () => {
  it('rilegge importi, percentuali, modalità e rate', async () => {
    esportaPropostaExcel('Scenario A', [
      {
        categoriaCreditore: 'Erario',
        importoDovuto: 12345.67,
        percentualeOfferta: 40,
        modalita: 'RATEALE',
        numeroRate: 24,
        note: 'Nota',
      },
      {
        categoriaCreditore: 'Fornitori',
        importoDovuto: 5000,
        percentualeOfferta: 15.5,
        modalita: 'UNICA_SOLUZIONE',
        numeroRate: null,
        note: null,
      },
    ]);

    const { righe, righeConErrore } = await importaPropostaExcel(ultimoFile());
    expect(righeConErrore).toEqual([]);
    expect(righe).toHaveLength(2);
    expect(righe[0]).toMatchObject({
      categoriaCreditore: 'Erario',
      importoDovuto: 12345.67,
      percentualeOfferta: 40,
      modalita: 'RATEALE',
      numeroRate: 24,
      note: 'Nota',
    });
    expect(righe[1]).toMatchObject({
      categoriaCreditore: 'Fornitori',
      importoDovuto: 5000,
      percentualeOfferta: 15.5,
      modalita: 'UNICA_SOLUZIONE',
    });
  });
});

describe('Posizione Aggiornata: export e re-import', () => {
  it('rilegge solo la colonna compilabile', async () => {
    const [primo, secondo] = CAMPI_POSIZIONE;
    const riferimento = { ...DATI_VUOTI, [primo.chiave]: 999 };
    const aggiornata = { ...DATI_VUOTI, [primo.chiave]: 1500, [secondo.chiave]: 2750.5 };

    esportaPosizioneExcel('Scenario', [{ etichetta: '2024', dati: riferimento }], aggiornata);

    const { dati } = await importaPosizioneExcel(ultimoFile());
    expect(dati[primo.chiave]).toBe(1500);
    expect(dati[secondo.chiave]).toBe(2750.5);
  });
});

describe('Debiti verso l’ente: import del formato a 4 colonne', () => {
  it('legge un file scritto da zero', async () => {
    const foglio = XLSX.utils.aoa_to_sheet([
      ['Voce', 'Importo (€)', 'Tipo (CLE / CEN / CEC / CEA)', 'Note'],
      ['IMU 2023', 1200.5, 'CLE', 'Avviso'],
      ['TARI 2022', 300, 'cen', ''],
      ['Totale', 1500.5, '', ''],
      ['Voce errata', 10, 'XYZ', ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, foglio, 'Debiti');

    const { righe, righeConErrore } = await importaDebitiEnteExcel(comeFile(wb, 'debiti.xlsx'));
    expect(righe.map((r) => [r.voce, r.importo, r.tipo, r.note])).toEqual([
      ['IMU 2023', 1200.5, 'CLE', 'Avviso'],
      ['TARI 2022', 300, 'CEN', null],
    ]);
    expect(righeConErrore).toHaveLength(1);
  });
});

describe('Tracciato debiti: date lette con cellDates', () => {
  it('restituisce oggetti Date con il giorno di calendario corretto', async () => {
    const foglio: XLSX.WorkSheet = {
      A1: { t: 's', v: 'Scadenza' },
      A2: { t: 'n', v: 45292, z: 'dd/mm/yyyy' }, // 01/01/2024
      A3: { t: 'n', v: 45657.5, z: 'dd/mm/yyyy' }, // 31/12/2024 ore 12
      '!ref': 'A1:A3',
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, foglio, 'INPS');

    const { foglioLetto, aoa } = await leggiFoglioAoa(comeFile(wb, 'tracciato.xlsx'));
    expect(foglioLetto).toBe('INPS');
    expect(aoa[1][0]).toBeInstanceOf(Date);
    expect(testoCella(aoa[1][0])).toBe('2024-01-01');
    expect(testoCella(aoa[2][0])).toBe('2024-12-31');
  });
});
