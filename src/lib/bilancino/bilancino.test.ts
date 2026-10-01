import { describe, it, expect } from 'vitest';
import { proponiCategoria, type IdCategoria } from './categorie';
import {
  numeroDaCella,
  riconosciColonne,
  estraiConti,
  firmaIntestazione,
  suggerisciOrientamento,
  dataDiRiferimento,
} from './lettura';
import { aggregaBilancino, type MappaConti } from './aggregazione';

// Bilancino di prova in quadratura (dare = avere = 1.000.000 di movimenti netti).
// Attivo: immobilizzazioni 300.000 − f.do amm. 100.000, clienti 250.000,
// cassa 5.000, banca attiva 45.000, magazzino 80.000 → 580.000
// Passivo: capitale 50.000, riserve 30.000, perdite a nuovo (10.000),
// fornitori 200.000, mutuo 150.000, INPS 40.000, Erario c/IVA 20.000,
// TFR 60.000 → 540.000 ; risultato del periodo +40.000
// CE: ricavi 500.000, acquisti 300.000, salari 120.000, ammortamenti 20.000,
// interessi passivi 15.000, rimanenze finali 0 → utile 45.000? no: 500−300−120−20−15 = 45
// Per chiudere: utile 40.000 → aggiungiamo imposte 5.000.
const FILE_DARE_AVERE: unknown[][] = [
  ['Bilancio di verifica al 30/06/2026'],
  [],
  ['Codice conto', 'Descrizione', 'Dare', 'Avere'],
  ['01.01', 'Impianti e macchinari', 300000, 0],
  ['01.02', 'F.do ammortamento impianti', 0, 100000],
  ['05.01', 'Clienti Italia', 250000, ''],
  ['06.01', 'Cassa contanti', 5000, ''],
  ['06.02', 'Banca Intesa c/c', 45000, ''],
  ['07.01', 'Magazzino merci', 80000, ''],
  ['10.01', 'Capitale sociale', '', 50000],
  ['10.02', 'Riserva legale', '', 30000],
  ['10.03', 'Perdite portate a nuovo', 10000, ''],
  ['20.01', 'Fornitori Italia', '', 200000],
  ['21.01', 'Mutuo Unicredit', '', 150000],
  ['22.01', 'INPS c/contributi', '', 40000],
  ['23.01', 'Erario c/IVA', '', 20000],
  ['24.01', 'Fondo TFR', '', 60000],
  ['60.01', 'Merci c/acquisti', 300000, ''],
  ['61.01', 'Salari e stipendi', 120000, ''],
  ['62.01', 'Ammortamento impianti', 20000, ''],
  ['63.01', 'Interessi passivi bancari', 15000, ''],
  ['64.01', 'IRES dell’esercizio', 5000, ''],
  ['70.01', 'Ricavi delle vendite', '', 500000],
  ['', 'Totale generale', 1150000, 1150000],
];

function mappaProposta(conti: { chiave: string; descrizione: string }[]): MappaConti {
  const m: MappaConti = {};
  for (const c of conti) m[c.chiave] = proponiCategoria(c.descrizione)?.categoria;
  return m;
}

describe('numeroDaCella', () => {
  it('legge i formati italiani, anglosassoni, parentesi e suffissi D/A', () => {
    expect(numeroDaCella('1.234,56')).toBe(1234.56);
    expect(numeroDaCella('1,234.56')).toBe(1234.56);
    expect(numeroDaCella('(1.234)')).toBe(-1234);
    expect(numeroDaCella('1.234 A')).toBe(-1234);
    expect(numeroDaCella('1.234 D')).toBe(1234);
    expect(numeroDaCella('€ 12.000')).toBe(12000);
    expect(numeroDaCella('1.234-')).toBe(-1234);
    expect(numeroDaCella('12.5')).toBe(12.5);
    expect(numeroDaCella('abc')).toBeNull();
    expect(numeroDaCella('')).toBeNull();
  });
});

describe('proposta di categoria', () => {
  const casi: [string, IdCategoria][] = [
    ['F.do ammortamento impianti', 'fondi_ammortamento'],
    ['Ammortamento impianti', 'ammortamenti'],
    ['Banca Intesa c/c', 'banca_cc'],
    ['Banca c/anticipi fatture', 'debiti_banche_breve'],
    ['Mutuo Unicredit', 'debiti_banche_ml'],
    ['Interessi passivi bancari', 'oneri_finanziari'],
    ['Spese bancarie', 'costi_operativi'],
    ['Altri ricavi e proventi', 'altri_ricavi'],
    ['Ricavi delle vendite', 'ricavi'],
    ['Acconti da clienti', 'altri_debiti'],
    ['Acconti a fornitori', 'altri_crediti'],
    ['Fatture da ricevere', 'debiti_fornitori'],
    ['Utile d’esercizio', 'escluso'],
    ['Perdita dell’esercizio precedente', 'perdite_pregresse'],
    ['Utili portati a nuovo', 'patrimonio_netto'],
    ['Totale attività', 'escluso'],
    ['Rimanenze finali merci', 'rimanenze_finali_ce'],
    ['Fondo trattamento di fine rapporto', 'fondi_tfr_rischi'],
    ['Contributi INPS a carico ditta', 'costi_operativi'],
    ['INPS c/contributi', 'enti_previdenziali'],
    ['Erario c/ritenute', 'erario'],
    ['Imposte e tasse deducibili', 'costi_operativi'],
  ];
  it.each(casi)('%s → %s', (descr, attesa) => {
    expect(proponiCategoria(descr)?.categoria).toBe(attesa);
  });
  it('nessuna regola → null (sceglie l’operatore)', () => {
    expect(proponiCategoria('Conto transitorio XY')).toBeNull();
  });
});

describe('lettura e aggregazione', () => {
  it('riconosce codice, descrizione, dare e avere e salta titolo e righe vuote', () => {
    const col = riconosciColonne(FILE_DARE_AVERE);
    expect(col).toMatchObject({
      rigaIntestazione: 2,
      codice: 0,
      descrizione: 1,
      dare: 2,
      avere: 3,
      modo: 'dare_avere',
    });
    const conti = estraiConti(FILE_DARE_AVERE, col);
    expect(conti).toHaveLength(21); // compresa la riga «Totale generale», che la proposta esclude
    expect(conti[0]).toMatchObject({ chiave: 'c:01.01', saldo: 300000, riga: 4 });
    expect(firmaIntestazione(FILE_DARE_AVERE, 2)).toBe('codice conto|descrizione|dare|avere');
  });

  it('aggrega nelle macro-voci e quadra', () => {
    const col = riconosciColonne(FILE_DARE_AVERE);
    const conti = estraiConti(FILE_DARE_AVERE, col);
    const r = aggregaBilancino(conti, mappaProposta(conti), col.modo);
    expect(r.nonAssegnati).toHaveLength(0);
    expect(r.dati).toMatchObject({
      ricaviVendite: 500000,
      valoreProduzione: 500000,
      costiProduzione: 440000,
      ebit: 60000,
      ebitda: 80000,
      oneriFinanziari: 15000,
      utileEsercizio: 40000,
      immobilizzazioni: 200000,
      creditiClienti: 250000,
      disponibilitaLiquide: 50000,
      attivoCircolante: 380000,
      totaleAttivo: 580000,
      patrimonioNetto: 110000,
      debitiBanche: 150000,
      debitiFornitori: 200000,
      debitiTributari: 20000,
      debitiPrevidenziali: 40000,
      totaleDebiti: 410000,
      passivoCorrente: 260000,
    });
    expect(r.quadratura.ok).toBe(true);
    expect(r.quadratura.differenza).toBe(0);
  });

  it('un conto dimenticato rompe la quadratura e resta elencato', () => {
    const col = riconosciColonne(FILE_DARE_AVERE);
    const conti = estraiConti(FILE_DARE_AVERE, col);
    const m = mappaProposta(conti);
    m['c:20.01'] = undefined;
    const r = aggregaBilancino(conti, m, col.modo);
    expect(r.quadratura.ok).toBe(false);
    expect(r.quadratura.differenza).toBe(200000);
    expect(r.nonAssegnati.map((c) => c.descrizione)).toEqual(['Fornitori Italia']);
  });

  it('saldo con segno (avere negativo) dà lo stesso risultato; la banca passiva diventa debito', () => {
    const file: unknown[][] = [
      ['Conto', 'Descrizione conto', 'Saldo al 30/06/2026'],
      ...FILE_DARE_AVERE.slice(3, -1).map((r) => [
        r[0],
        r[1],
        Number(r[2] || 0) - Number(r[3] || 0),
      ]),
      ['06.03', 'Banca BPM c/c', -10000],
      ['06.04', 'Cassa assegni', 10000],
    ];
    const col = riconosciColonne(file);
    expect(col.modo).toBe('saldo_dare_positivo');
    expect(col.saldo).toBe(2);
    const conti = estraiConti(file, col);
    expect(suggerisciOrientamento(conti)).toBe('saldo_dare_positivo');
    const r = aggregaBilancino(conti, mappaProposta(conti), col.modo);
    expect(r.quadratura.ok).toBe(true);
    expect(r.dati.debitiBanche).toBe(160000);
    expect(r.dati.passivoCorrente).toBe(270000);
    expect(r.dati.disponibilitaLiquide).toBe(60000);
  });

  it('importi senza segno: i rettificativi sottraggono per categoria', () => {
    const file: unknown[][] = [
      ['Descrizione', 'Importo'],
      ...FILE_DARE_AVERE.slice(3, -1).map((r) => [r[1], Number(r[2] || 0) + Number(r[3] || 0)]),
    ];
    const col = riconosciColonne(file);
    expect(col).toMatchObject({
      codice: null,
      descrizione: 0,
      saldo: 1,
      modo: 'saldo_senza_segno',
    });
    const conti = estraiConti(file, col);
    expect(conti[0].chiave).toBe('d:impianti e macchinari');
    const r = aggregaBilancino(conti, mappaProposta(conti), col.modo);
    expect(r.dati.immobilizzazioni).toBe(200000);
    expect(r.dati.patrimonioNetto).toBe(110000);
    expect(r.quadratura.ok).toBe(true);
    expect(r.doppiaNaturaSenzaSegno.map((c) => c.descrizione)).toEqual([
      'Banca Intesa c/c',
      'INPS c/contributi',
      'Erario c/IVA',
    ]);
  });
});

describe('data di riferimento', () => {
  it('dal titolo del foglio o dal nome del file', () => {
    expect(dataDiRiferimento(FILE_DARE_AVERE)).toBe('2026-06-30');
    expect(dataDiRiferimento([['Conto', 'Saldo']], 'bilancino_31-03-2026.xlsx')).toBe('2026-03-31');
    expect(dataDiRiferimento([['Conto', 'Saldo']], 'bilancino.xlsx')).toBeNull();
  });
});

describe('CSV letto come testo', () => {
  it('codici «01.01» e importi «-100.000,00» come stringhe', () => {
    const file: unknown[][] = [
      ['Conto', 'Descrizione conto', 'Saldo'],
      ...FILE_DARE_AVERE.slice(3, -1).map((r) => {
        const s = Number(r[2] || 0) - Number(r[3] || 0);
        return [
          r[0],
          r[1],
          s.toLocaleString('it-IT', { minimumFractionDigits: 2, useGrouping: true }),
        ];
      }),
    ];
    const col = riconosciColonne(file);
    expect(col).toMatchObject({ codice: 0, descrizione: 1, saldo: 2, modo: 'saldo_dare_positivo' });
    const conti = estraiConti(file, col);
    expect(conti[1]).toMatchObject({ chiave: 'c:01.02', saldo: -100000 });
    const r = aggregaBilancino(conti, mappaProposta(conti), col.modo);
    expect(r.quadratura.ok).toBe(true);
    expect(r.dati.totaleAttivo).toBe(580000);
  });
});
