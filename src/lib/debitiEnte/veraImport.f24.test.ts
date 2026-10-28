import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  analizzaVera,
  estraiRigheVera,
  periodoDaVera,
  ritardoDaVera,
  totaliVera,
} from './veraImport';

// IL DEBITO CHE C'È ANCHE SE IL «TOTALE DEBITO» È VUOTO.
//
// Nel V.E.R.A. delle gestioni contributive le righe «F24 non presentato»
// portano la cifra nelle colonne «Contributi» e «Sanzioni» e lasciano vuoto
// il totale. Lette come totale, valevano zero: la posizione finiva fra quelle
// «a importo ignoto» e il ritardo di oltre 90 giorni — che è un requisito
// dell'art. 25-novies — non la vedeva affatto.
//
// Il foglio è costruito qui dentro, con la stessa forma di quello dell'ente
// (colonne intestate a righe alterne, riga di totale in coda), così il test
// attraversa la lettura vera e non una sua imitazione.

const INTESTAZIONI = [
  'Posizione',
  '',
  'Natura omissione/Tipologia',
  '',
  'Stato',
  '',
  'Periodo',
  '',
  'N.inadempienza',
  '',
  'Contributi',
  '',
  'Sanzioni',
  '',
  'Totale debito',
  '',
  'Totale credito',
];

/** Una riga del foglio: le colonne vuote si passano come stringa vuota. */
function riga(dati: {
  voce: string;
  stato?: string;
  periodo?: string | Date;
  contributi?: number | '';
  sanzioni?: number | '';
  totale?: number | '';
}): (string | number | Date | null)[] {
  return [
    '7699999901',
    '',
    dati.voce,
    '',
    dati.stato ?? '',
    '',
    dati.periodo ?? '',
    '',
    '03012',
    '',
    dati.contributi ?? '',
    '',
    dati.sanzioni ?? '',
    '',
    dati.totale ?? '',
    '',
    '',
  ];
}

function fileVera(): File {
  const aoa: (string | number | Date | null)[][] = [
    ['GESTIONE LAVORATORI DIPENDENTI PRIVATI'],
    INTESTAZIONI,
    // Contabilizzata con il totale compilato: l'importo è il totale.
    riga({
      voce: 'TS 27 flusso Uniemens non versato',
      periodo: '202506 - 202506',
      contributi: 3_041,
      sanzioni: 363.02,
      totale: 3_404.02,
    }),
    // «Totale debito» vuoto, la cifra sta nei Contributi.
    riga({ voce: 'F24 Non presentato', periodo: '06/2026', contributi: 9_590 }),
    // Come sopra, ma con la sanzione e il periodo in una cella data.
    riga({
      voce: 'F24 Non presentato',
      periodo: new Date(2026, 2, 1),
      contributi: 1_500,
      sanzioni: 250,
    }),
    // Scaduta più di recente: l'importo si legge, ma non conta nel ritardo.
    riga({ voce: 'F24 Non presentato', periodo: '01/2027', contributi: 400 }),
    // Importo nel totale ma nessuna quota di contributi: sta fuori dalla base
    // della soglia INPS, quindi non deve entrare nel ritardo.
    riga({ voce: 'Denunce non trasmesse', periodo: '09/2025', totale: 2_000 }),
    // Niente totale e niente dettaglio: l'importo resta ignoto per davvero.
    riga({ voce: 'Denunce non trasmesse', periodo: '07/2026' }),
    ['Totale gestione:', 16_744.02],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dettaglio Verifica');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], 'F24.xlsx');
}

describe('V.E.R.A.: l’importo delle righe con «Totale debito» vuoto', () => {
  it('legge il debito dalle colonne di dettaglio invece di dichiararlo ignoto', async () => {
    const a = await analizzaVera(fileVera());
    const [sezione] = a.sezioni;
    expect(sezione.righe.map((r) => r.importo)).toEqual([3_404.02, 9_590, 1_750, 400, 2_000, 0]);
    expect(sezione.righe.map((r) => r.contributi)).toEqual([3_041, 9_590, 1_500, 400, 0, 0]);
    expect(sezione.righe.map((r) => r.sanzioni)).toEqual([363.02, 0, 250, 0, 0, 0]);
    // Il totale di sezione è la somma degli importi della riga, non dei totali
    // scritti a mano nel file.
    expect(sezione.totale).toBeCloseTo(17_144.02, 2);
  });

  it('non somma il dettaglio quando il totale c’è: niente doppio conteggio', async () => {
    const a = await analizzaVera(fileVera());
    // 3.041 + 363,02 = 3.404,02: il totale comprende già le due voci.
    expect(a.sezioni[0].righe[0].importo).toBe(3_404.02);
  });

  // CHI HA LA COMPOSIZIONE È CONTABILIZZATO, CHI HA SOLO IL TOTALE NO.
  //
  // Le righe F24 hanno contributi e sanzioni: la cifra è già in contabilità, sotto
  // il suo dettaglio. La «Denunce non trasmesse» con la sola cifra nel totale non
  // ha nessuna composizione: è un debito che l'ente deve ancora iscrivere, e per
  // questo deve arrivare ai documenti per gli uffici invece di essere dichiarata
  // «già contabilizzata». Restano fuori soltanto le righe senza alcun importo.
  it('non sono «a importo ignoto»: contabilizzate se composte, da contabilizzare se solo a totale', async () => {
    const a = await analizzaVera(fileVera());
    const { righe } = estraiRigheVera(a.sezioni, {}, {}, true);
    expect(righe.map((r) => r.trattamento)).toEqual([
      'contabilizzato',
      'contabilizzato',
      'contabilizzato',
      'contabilizzato',
      'da_contabilizzare',
      'potenziale',
    ]);
    const t = totaliVera(righe);
    // La base della soglia INPS usa i contributi, non il totale: le righe
    // F24 ci entravano già, ed è il ritardo che ora le vede.
    expect(t.contributiInps).toBeCloseTo(14_531, 2);
    expect(t.sanzioni).toBeCloseTo(613.02, 2);
  });

  it('conta nel ritardo oltre 90 giorni anche i periodi «MM/AAAA» e le date', async () => {
    const a = await analizzaVera(fileVera());
    const r = ritardoDaVera(a.sezioni, new Date('2026-10-19T12:00:00Z'));
    expect(r?.partite).toBe(3);
    expect(r?.importo).toBeCloseTo(3_404.02 + 9_590 + 1_750, 2);
    expect(r?.periodi).toEqual(['2025/06', '2026/06', '2026/03']);
  });

  it('una riga senza quota di contributi non entra nel ritardo', async () => {
    const a = await analizzaVera(fileVera());
    const r = ritardoDaVera(a.sezioni, new Date('2026-10-19T12:00:00Z'));
    // La riga «Denunce non trasmesse» di settembre 2025 è scaduta da oltre 90
    // giorni, ma non forma la base INPS: importo e ritardo devono riguardare
    // lo stesso debito.
    expect(r?.periodi).not.toContain('2025/09');
  });
});

describe('periodoDaVera', () => {
  it('riconosce le forme in cui il file scrive il periodo', () => {
    expect(periodoDaVera('202506 - 202506')).toEqual({ anno: 2025, mese: 6 });
    expect(periodoDaVera('2025/06')).toEqual({ anno: 2025, mese: 6 });
    expect(periodoDaVera('06/2026')).toEqual({ anno: 2026, mese: 6 });
    expect(periodoDaVera('2026-05-01')).toEqual({ anno: 2026, mese: 5 });
    expect(periodoDaVera(' 04/2024 ')).toEqual({ anno: 2024, mese: 4 });
  });

  it('un numero seriale o un mese impossibile non sono un periodo', () => {
    expect(periodoDaVera('46082')).toBeNull();
    expect(periodoDaVera('13/2026')).toBeNull();
    expect(periodoDaVera('')).toBeNull();
    expect(periodoDaVera('n.d.')).toBeNull();
  });
});
