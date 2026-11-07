// Verifica del giro completo del foglio dei prodotti: si scrive il foglio dei
// prodotti configurati, lo si rilegge come farebbe Excel, e si controlla che
// l'anteprima dica la verità prima di importare. Il caso che conta è l'id della
// domanda: se una rilettura lo cambiasse, le risposte del triage resterebbero
// agganciate a una domanda che non esiste più.

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

import {
  confrontaImport,
  esportaProdottiExcel,
  leggiProdottiDaExcel,
} from '@/lib/prodotti/prodottiExcel';
import type { ProdottoEnte } from '@/lib/prodotti/prodotti';

function comeFile(wb: XLSX.WorkBook, nome: string): File {
  const byte = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([byte], nome);
}

function foglioDa(righe: (string | number)[][]): XLSX.WorkBook {
  const foglio = XLSX.utils.aoa_to_sheet(righe);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglio, 'Prodotti');
  return wb;
}

beforeEach(() => {
  catturati.length = 0;
});

const INTESTAZIONI = [
  'Direttrice',
  'Prodotto',
  'In check list',
  'Id domanda',
  'Domanda',
  'Risposta',
  'Risposta negativa',
  'Max caratteri',
];

describe('foglio dei prodotti: andata e ritorno', () => {
  const prodotti: ProdottoEnte[] = [
    {
      id: 1,
      direttrice: 'Entrate',
      nome: 'DURC',
      inChecklist: true,
      ordine: 1,
      domande: [
        {
          id: 'q1',
          testo: 'Il versamento risulta regolare?',
          tipo: 'SI_NO',
          maxCaratteri: null,
          rispostaNegativa: 'SI',
        },
        {
          id: 'q2',
          testo: 'Quali misure ha adottato l’azienda?',
          tipo: 'TESTO_LIBERO',
          maxCaratteri: 800,
          rispostaNegativa: 'NO',
        },
      ],
    },
    { id: 2, direttrice: 'Entrate', nome: 'Diffide', inChecklist: false, ordine: 2, domande: [] },
  ];

  it('riscrive prodotti, domande, tipi e tetti senza perdere nulla', async () => {
    esportaProdottiExcel('Spazio Prova', prodotti, ['Entrate', 'Uffici diversi']);
    expect(catturati[0].nome).toBe('prodotti_ente_spazio_prova.xlsx');

    const esito = await leggiProdottiDaExcel(comeFile(catturati[0].wb, catturati[0].nome));
    expect(esito.righeConErrore).toEqual([]);
    expect(esito.prodotti).toHaveLength(2);
    expect(esito.prodotti[0]).toMatchObject({
      direttrice: 'Entrate',
      nome: 'DURC',
      inChecklist: true,
    });
    expect(esito.prodotti[0].domande).toEqual(prodotti[0].domande);
    expect(esito.prodotti[1]).toMatchObject({
      nome: 'Diffide',
      inChecklist: false,
      domande: [],
    });
  });

  it('dà id stabili quando la colonna è vuota', async () => {
    const esito = await leggiProdottiDaExcel(
      comeFile(
        foglioDa([
          ['Una riga per domanda.'],
          INTESTAZIONI,
          ['Entrate', 'DURC', 'Sì', '', 'Il versamento risulta regolare?', 'Sì/No', '', ''],
          ['Entrate', 'DURC', '', '', 'Quali misure ha adottato?', 'Testo libero', '', 700],
        ]),
        'prodotti.xlsx'
      )
    );
    expect(esito.righeConErrore).toEqual([]);
    expect(esito.prodotti).toHaveLength(1);
    expect(esito.prodotti[0].domande).toEqual([
      {
        id: 'q1',
        testo: 'Il versamento risulta regolare?',
        tipo: 'SI_NO',
        maxCaratteri: null,
        rispostaNegativa: 'NO',
      },
      {
        id: 'q2',
        testo: 'Quali misure ha adottato?',
        tipo: 'TESTO_LIBERO',
        maxCaratteri: 700,
        rispostaNegativa: 'NO',
      },
    ]);
  });

  it('segnala la riga, non importa il prodotto, quando il flag è senza domande', async () => {
    const esito = await leggiProdottiDaExcel(
      comeFile(
        foglioDa([
          INTESTAZIONI,
          ['Entrate', 'Cassa integrazione', 'Sì', '', '', '', '', ''],
          ['Entrate', 'Solleciti', 'No', '', 'Un sollecito è partito?', 'Boh', '', ''],
        ]),
        'prodotti.xlsx'
      )
    );
    expect(esito.prodotti).toEqual([]);
    expect(esito.righeConErrore).toHaveLength(2);
    expect(esito.righeConErrore[0].motivo).toContain('almeno una domanda');
    expect(esito.righeConErrore[1].motivo).toContain('tipo di risposta');
  });
});

describe('anteprima dell’import', () => {
  const esistenti: ProdottoEnte[] = [
    {
      id: 1,
      direttrice: 'Entrate',
      nome: 'DURC',
      inChecklist: true,
      ordine: 1,
      domande: [
        {
          id: 'q1',
          testo: 'Il versamento risulta regolare?',
          tipo: 'SI_NO',
          maxCaratteri: null,
          rispostaNegativa: 'NO',
        },
        {
          id: 'q2',
          testo: 'Quali misure ha adottato?',
          tipo: 'TESTO_LIBERO',
          maxCaratteri: 800,
          rispostaNegativa: 'NO',
        },
      ],
    },
    { id: 2, direttrice: 'Entrate', nome: 'Diffide', inChecklist: false, ordine: 2, domande: [] },
  ];

  it('distingue nuovi, aggiornati e invariati, e dice quali domande spariscono', () => {
    const confronto = confrontaImport(esistenti, [
      {
        id: null,
        direttrice: 'Entrate',
        nome: 'DURC',
        inChecklist: true,
        domande: [
          { id: 'q1', testo: 'Il versamento risulta regolare?', tipo: 'SI_NO', maxCaratteri: null },
          {
            id: 'q2',
            testo: 'Quali misure ha adottato l’azienda?',
            tipo: 'TESTO_LIBERO',
            maxCaratteri: 500,
          },
          { id: 'q3', testo: 'C’è una rateizzazione?', tipo: 'SI_NO', maxCaratteri: null },
        ],
      },
      { id: null, direttrice: 'Entrate', nome: 'Diffide', inChecklist: false, domande: [] },
      {
        id: null,
        direttrice: 'Uffici diversi',
        nome: 'Solleciti',
        inChecklist: true,
        domande: [
          { id: 'q1', testo: 'Un sollecito è partito?', tipo: 'SI_NO', maxCaratteri: null },
        ],
      },
    ]);

    const durc = confronto.voci.find((v) => v.nome === 'DURC');
    expect(durc?.stato).toBe('AGGIORNATO');
    expect(durc?.domandeModificate).toEqual(['q2']);
    expect(durc?.domandeAggiunte).toEqual(['q3']);
    expect(confronto.voci.find((v) => v.nome === 'Diffide')?.stato).toBe('INVARIATO');
    expect(confronto.voci.find((v) => v.nome === 'Solleciti')?.stato).toBe('NUOVO');
    expect([confronto.nuovi, confronto.aggiornati, confronto.invariati]).toEqual([1, 1, 1]);
  });
});
