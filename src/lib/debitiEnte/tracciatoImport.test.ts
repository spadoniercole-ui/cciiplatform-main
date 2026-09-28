import { describe, it, expect } from 'vitest';
import { estraiRighe, parseNumero, rilevaCodiciNuovi, suggerisciRuoli } from './tracciatoImport';
import { estraiSezione, type Aoa, type SezioneEstratta, type Tracciato } from './tracciatoCore';

function tracciato(parziale: Partial<Tracciato>): Tracciato {
  return {
    id: 1,
    nome: 'Prova',
    foglio: 'Foglio1',
    intestazioni: [],
    ruoli: [],
    classificazioneModo: 'tipo_fisso',
    tipoFisso: 'DEBITO',
    mappaturaCodici: {},
    codiciNoti: [],
    nomeFileOrigine: null,
    ...parziale,
  };
}

describe('parseNumero', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1.234.567,89', 1234567.89],
    ['€ 1 234', 1234],
    ['€ 1.234,56', 1234.56],
    ['1234.56', 1234.56],
    ['1234,56', 1234.56],
    ['-1.234,56', -1234.56],
    ['1.234', 1234],
    ['0,5', 0.5],
    ['1 234,00', 1234],
    ['  42  ', 42],
  ])('interpreta "%s" come %d', (testo, atteso) => {
    expect(parseNumero(testo)).toBeCloseTo(atteso, 10);
  });

  it('restituisce i numeri finiti così come sono', () => {
    expect(parseNumero(1234.56)).toBe(1234.56);
    expect(parseNumero(-7)).toBe(-7);
  });

  it('numeri non finiti → 0', () => {
    expect(parseNumero(NaN)).toBe(0);
    expect(parseNumero(Infinity)).toBe(0);
  });

  it('cella vuota o null → 0', () => {
    expect(parseNumero('')).toBe(0);
    expect(parseNumero(null)).toBe(0);
    expect(parseNumero(undefined)).toBe(0);
  });

  it('testo non numerico → 0 (mai NaN)', () => {
    expect(parseNumero('abc')).toBe(0);
    expect(parseNumero('n.d.')).toBe(0);
  });

  it.todo('importo negativo contabile tra parentesi: "(1.234,56)" oggi dà 0 invece di -1234.56');
  it.todo(
    'formato anglosassone con virgola delle migliaia: "1,234.56" oggi dà 0 invece di 1234.56'
  );
  it.todo(
    'punto seguito da esattamente tre cifre è sempre migliaia: "1234.567" (testo con tre ' +
      'decimali) dà 1234567; ambiguo, da confermare'
  );
});

describe('estraiRighe', () => {
  const aoa: Aoa = [
    ['Estratto conto contributivo'],
    [],
    ['Voce', null, 'Codice', 'Importo', 'Versato', 'Data', 'Note', 'Matricola'],
    ['Contributi 01/2023', null, 'D1', '1.000,00', '200,00', '2023-02-16', '', 'M1'],
    ['Sanzioni 01/2023', null, 'A1', '150,50', '', '2023-03-16', 'rateizzata', ''],
    ['', null, 'D1', '99', '0', '', '', ''],
    ['Contributi 02/2023', null, 'XX', '10', '', '', '', ''],
    ['Totale generale', null, '', '1.259,50', '', '', '', ''],
    ['Riga dopo il totale', null, 'D1', '5', '', '', '', ''],
  ];
  const sezione = estraiSezione(aoa);
  const ruoli: Tracciato['ruoli'] = [
    'voce',
    'guida',
    'importo',
    'importo_versato',
    'data',
    'nota',
    'extra',
  ];

  it('estraiSezione trova l’header dopo il titolo e si ferma alla riga di totale', () => {
    expect(sezione.headerRow).toBe(2);
    expect(sezione.intestazioni).toEqual([
      'Voce',
      'Codice',
      'Importo',
      'Versato',
      'Data',
      'Note',
      'Matricola',
    ]);
    expect(sezione.righe).toHaveLength(4);
    expect(sezione.fermatoARiga).toBe(7);
  });

  it('colonna guida: mappa i codici, scarta quelli non mappati, non importa il totale', () => {
    const t = tracciato({
      ruoli,
      classificazioneModo: 'colonna_guida',
      tipoFisso: null,
      mappaturaCodici: { D1: 'DEBITO', A1: 'AVA' },
    });
    const { righe, scartate } = estraiRighe(sezione, t);
    expect(righe).toHaveLength(3);
    expect(righe[0]).toEqual({
      voce: 'Contributi 01/2023',
      importo: 1000,
      importoVersato: 200,
      tipo: 'DEBITO',
      note: null,
      data: '2023-02-16',
      datiExtra: { Matricola: 'M1' },
      codiceGuida: 'D1',
    });
    expect(righe[1]).toMatchObject({
      voce: 'Sanzioni 01/2023',
      importo: 150.5,
      tipo: 'AVA',
      note: 'rateizzata',
      datiExtra: null,
    });
    // voce vuota → etichetta di ripiego con numero di riga 1-based
    expect(righe[2].voce).toBe('Riga 3');
    expect(scartate).toEqual([{ indice: 3, motivo: 'categoria non risolvibile per questa riga' }]);
    expect(righe.some((r) => /totale/i.test(r.voce))).toBe(false);
    expect(righe.some((r) => r.voce === 'Riga dopo il totale')).toBe(false);
  });

  it('tipo fisso: tutte le righe ricevono lo stesso codice e codiceGuida null', () => {
    const t = tracciato({ ruoli, classificazioneModo: 'tipo_fisso', tipoFisso: 'NEUTRO' });
    const { righe, scartate } = estraiRighe(sezione, t);
    expect(righe).toHaveLength(4);
    expect(righe.every((r) => r.tipo === 'NEUTRO' && r.codiceGuida === null)).toBe(true);
    expect(scartate).toEqual([]);
  });

  it('tipo fisso senza codice → tutte le righe scartate', () => {
    const t = tracciato({ ruoli, classificazioneModo: 'tipo_fisso', tipoFisso: null });
    const { righe, scartate } = estraiRighe(sezione, t);
    expect(righe).toEqual([]);
    expect(scartate).toHaveLength(4);
  });

  it('senza colonna importo tutte le righe sono scartate con motivo', () => {
    const t = tracciato({ ruoli: ['voce', 'guida', 'ignora', 'ignora', 'data', 'nota', 'extra'] });
    const { righe, scartate } = estraiRighe(sezione, t);
    expect(righe).toEqual([]);
    expect(scartate.every((s) => s.motivo === 'importo assente o non numerico')).toBe(true);
    expect(scartate).toHaveLength(4);
  });

  it('senza colonna versato importoVersato è null', () => {
    const t = tracciato({ ruoli: ['voce', 'guida', 'importo', 'ignora', 'data', 'nota', 'extra'] });
    const { righe } = estraiRighe(sezione, t);
    expect(righe.every((r) => r.importoVersato === null)).toBe(true);
  });

  it('una riga di sola prima colonna (titolo di sezione) chiude la sezione', () => {
    const aoa2: Aoa = [
      ['Voce', 'Importo', 'Data'],
      ['A', '10', '2024-01-01'],
      ['SEZIONE SUCCESSIVA'],
      ['B', '20', '2024-02-01'],
    ];
    const sez = estraiSezione(aoa2);
    const { righe } = estraiRighe(sez, tracciato({ ruoli: ['voce', 'importo', 'data'] }));
    expect(righe.map((r) => r.voce)).toEqual(['A']);
  });

  it.todo(
    'importo non numerico o vuoto: parseNumero non restituisce mai NaN, quindi la riga ' +
      '{ Importo: "n.d." } viene importata con importo 0 invece di finire tra le scartate'
  );
  it.todo(
    'riga di totale con l’etichetta fuori dalla prima colonna reale ' +
      '(es. ["", "", "Totale", "1.259,50"]) non è riconosciuta e viene importata come debito'
  );
  it.todo('colonna versato presente ma cella vuota: importoVersato vale 0 invece di null');
});

describe('rilevaCodiciNuovi', () => {
  const sezione: SezioneEstratta = {
    headerRow: 0,
    intestazioni: ['Voce', 'Codice', 'Importo'],
    colonneReali: [0, 1, 2],
    righe: [
      ['a', 'D1', 1],
      ['b', 'Z9', 2],
      ['c', 'Z9', 3],
      ['d', '', 4],
    ],
    fermatoARiga: 5,
  };

  it('elenca una sola volta i codici guida non ancora mappati', () => {
    const t = tracciato({
      ruoli: ['voce', 'guida', 'importo'],
      classificazioneModo: 'colonna_guida',
      mappaturaCodici: { D1: 'DEBITO' },
    });
    expect(rilevaCodiciNuovi(sezione, t)).toEqual(['Z9']);
  });

  it('in modo tipo fisso non ci sono codici da mappare', () => {
    const t = tracciato({ ruoli: ['voce', 'guida', 'importo'] });
    expect(rilevaCodiciNuovi(sezione, t)).toEqual([]);
  });
});

describe('suggerisciRuoli', () => {
  it.each([
    ['Importo', 'importo'],
    ['Imp. debito', 'importo'],
    ['Residuo', 'importo'],
    ['Contributi', 'importo'],
    ['Totale debito', 'importo'],
    ['Versato', 'importo_versato'],
    ['Totale versato', 'importo_versato'],
    ['Data scadenza', 'data'],
    ['Periodo', 'data'],
    ['Anno', 'data'],
    ['Descrizione', 'voce'],
    ['Natura', 'voce'],
    ['Causale', 'voce'],
    ['CSL', 'guida'],
    ['Tipo', 'guida'],
    ['Stato lavorazione', 'guida'],
    ['Note', 'nota'],
    ['Matricola', 'ignora'],
    ['', 'ignora'],
  ])('"%s" → %s', (intestazione, atteso) => {
    expect(suggerisciRuoli([intestazione])).toEqual([atteso]);
  });

  it('restituisce un ruolo per ciascuna intestazione, nello stesso ordine', () => {
    expect(suggerisciRuoli(['Descrizione', 'Importo', 'Note'])).toEqual([
      'voce',
      'importo',
      'nota',
    ]);
  });

  it.todo('"Importo versato" oggi è suggerito come importo invece di importo_versato');
  it.todo('"Data versamento" oggi è suggerito come importo_versato invece di data');
  it.todo('"Annotazioni" oggi è suggerito come data (contiene "anno") invece di nota');
});
