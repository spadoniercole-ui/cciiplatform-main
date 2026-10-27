import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { analizzaVera, estraiRigheVera } from './veraImport';
import { denunceDuplicateVera, insiemeEsclusi, type RigaPerDuplicati } from './duplicatiVera';
import { ripartisciRigheVera, testiContabilizzate } from '@/lib/lavorazioni/daLavorare';

// LO STESSO DEBITO SCRITTO DUE VOLTE.
//
// Nel V.E.R.A. dell'ente la stessa obbligazione compare come «F24 non
// presentato» (con la cifra nelle colonne Contributi e Sanzioni) e come
// «Denunce non trasmesse» (con la cifra nel totale), nello stesso periodo e per
// lo stesso importo. Sommarle nell'esposizione dichiarava un debito che non
// esiste: i numeri qui sotto sono quelli del file reale (foglio «Dettaglio
// Verifica», gestione lavoratori dipendenti privati).

const F24 = 'F24 Non presentato';
const DENUNCE = 'Denunce non trasmesse';

const riga = (voce: string, periodo: string | undefined, importo: number): RigaPerDuplicati => ({
  voce,
  periodo,
  importo,
});

describe('denunceDuplicateVera', () => {
  it('riconosce la coppia F24 / denunce dello stesso periodo e importo', () => {
    const esito = denunceDuplicateVera([
      riga(F24, '06/2026', 9_590),
      riga(DENUNCE, '2026-06-01', 9_590),
      riga('TS 27 flusso Uniemens non versato', '202506 - 202506', 3_404.02),
    ]);
    expect(esito.indiciDaNonSommare).toEqual([1]);
    expect(esito.righe).toBe(1);
    expect(esito.totale).toBe(9_590);
    expect(esito.periodi).toEqual(['2026-06']);
  });

  it('sconta le quattro coppie del file reale, non una di più', () => {
    // Le righe F24 del file e le denunce che le ripetono, con i periodi nelle
    // due forme in cui compaiono (MM/AAAA e data letta da xlsx).
    const esito = denunceDuplicateVera([
      riga(F24, '06/2026', 9_590),
      riga(F24, '2026-05-01', 4_878.74),
      riga(F24, '2026-04-01', 4_907.9),
      riga(F24, '2026-03-01', 11_859.71),
      riga(DENUNCE, '2026-03-01', 11_859.71),
      riga(DENUNCE, '2026-04-01', 4_907.9),
      riga(DENUNCE, '2026-05-01', 4_878.74),
      riga(DENUNCE, '2026-06-01', 9_590),
      // Denuncia senza importo: non c'è cifra da scontare.
      riga(DENUNCE, '07/2026', 0),
    ]);
    expect(esito.righe).toBe(4);
    expect(esito.totale).toBeCloseTo(31_236.35, 2);
    expect(esito.periodi).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
  });

  it('sconta una denuncia per ogni F24: l’accoppiamento è uno a uno', () => {
    const esito = denunceDuplicateVera([
      riga(F24, '06/2026', 9_590),
      riga(F24, '06/2026', 9_590),
      riga(DENUNCE, '2026-06-01', 9_590),
    ]);
    // Due F24 identici e una sola denuncia: si sconta la denuncia, una volta.
    expect(esito.righe).toBe(1);

    const unaSola = denunceDuplicateVera([
      riga(F24, '06/2026', 9_590),
      riga(DENUNCE, '2026-06-01', 9_590),
      riga(DENUNCE, '2026-06-01', 9_590),
    ]);
    expect(unaSola.righe).toBe(1);
  });

  it('periodo diverso o importo diverso: nessuna coppia', () => {
    expect(
      denunceDuplicateVera([riga(F24, '06/2026', 9_590), riga(DENUNCE, '2026-05-01', 9_590)]).righe
    ).toBe(0);
    expect(
      denunceDuplicateVera([riga(F24, '06/2026', 9_590), riga(DENUNCE, '2026-06-01', 9_589)]).righe
    ).toBe(0);
    // Al centesimo, invece, sì: sono lo stesso importo scritto in due modi.
    expect(
      denunceDuplicateVera([riga(F24, '06/2026', 9_590), riga(DENUNCE, '2026-06-01', 9_590.0)])
        .righe
    ).toBe(1);
  });

  it('senza periodo non si accoppia nulla', () => {
    const esito = denunceDuplicateVera([riga(F24, '', 9_590), riga(DENUNCE, undefined, 9_590)]);
    expect(esito.righe).toBe(0);
    expect(esito.indiciDaNonSommare).toEqual([]);
  });

  it('una coppia di denunce e F24 in una sola riga non si sconta', () => {
    const esito = denunceDuplicateVera([riga('F24 e denunce non trasmesse', '06/2026', 9_590)]);
    expect(esito.righe).toBe(0);
  });

  it('non guarda gli importi negativi o nulli', () => {
    const esito = denunceDuplicateVera([riga(F24, '06/2026', 0), riga(DENUNCE, '2026-06-01', 0)]);
    expect(esito.righe).toBe(0);
  });

  it('gli indici sono quelli delle righe ricevute', () => {
    const righe = [
      riga('Verbale Evasione', '2026-01-01', 100),
      riga(F24, '06/2026', 9_590),
      riga('TS 25 nota di rettifica', '202508 - 202508', 784.13),
      riga(DENUNCE, '2026-06-01', 9_590),
    ];
    const esito = denunceDuplicateVera(righe);
    expect(esito.indiciDaNonSommare).toEqual([3]);
    const escluse = insiemeEsclusi(esito);
    expect(righe.filter((_, i) => !escluse.has(i)).map((r) => r.voce)).toEqual([
      'Verbale Evasione',
      F24,
      'TS 25 nota di rettifica',
    ]);
  });
});

// Il foglio ha la forma di quello dell'ente (colonne intestate a righe alterne,
// riga di totale in coda): il test attraversa la lettura vera e non una sua
// imitazione, e prova che i due formati di periodo finiscono nella stessa chiave.
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

function rigaFoglio(dati: {
  voce: string;
  periodo: string | Date;
  contributi?: number;
  totale?: number;
}): (string | number | Date | null)[] {
  return [
    '7699999901',
    '',
    dati.voce,
    '',
    '',
    '',
    dati.periodo,
    '',
    '03012',
    '',
    dati.contributi ?? '',
    '',
    '',
    '',
    dati.totale ?? '',
    '',
    '',
  ];
}

async function righeDalFoglio() {
  const aoa: (string | number | Date | null)[][] = [
    ['GESTIONE LAVORATORI DIPENDENTI PRIVATI'],
    INTESTAZIONI,
    rigaFoglio({ voce: F24, periodo: '06/2026', contributi: 9_590 }),
    rigaFoglio({ voce: F24, periodo: new Date(2026, 4, 1), contributi: 4_878.74 }),
    rigaFoglio({ voce: DENUNCE, periodo: '2026-06-01', totale: 9_590 }),
    rigaFoglio({ voce: DENUNCE, periodo: '2026-05-01', totale: 4_878.74 }),
    rigaFoglio({ voce: DENUNCE, periodo: '07/2026' }),
    ['Totale gestione:', 28_917.48],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dettaglio Verifica');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const a = await analizzaVera(new File([buf], 'DettaglioRichiesta.xlsx'));
  return estraiRigheVera(a.sezioni, {}, {}, true).righe;
}

describe('la doppia scrittura letta dal file', () => {
  it('riconosce le coppie attraverso i formati del periodo del foglio', async () => {
    const righe = await righeDalFoglio();
    const esito = denunceDuplicateVera(righe);
    expect(esito.righe).toBe(2);
    expect(esito.totale).toBeCloseTo(9_590 + 4_878.74, 2);
    expect(esito.periodi).toEqual(['2026-05', '2026-06']);
  });
});

describe('la doppia scrittura nei documenti per gli uffici', () => {
  const contabilizzata = (voce: string, periodo: string, importo: number) => ({
    voce,
    stato: '',
    importo,
    trattamento: 'contabilizzato' as const,
    periodo,
  });

  it('non entra due volte nella dichiarazione delle già contabilizzate, e si dichiara', () => {
    const ripartizione = ripartisciRigheVera([
      contabilizzata(F24, '06/2026', 9_590),
      contabilizzata(DENUNCE, '2026-06-01', 9_590),
      contabilizzata('TS 27 flusso Uniemens non versato', '202506 - 202506', 3_404.02),
    ]);
    expect(ripartizione.contabilizzate).toEqual({ righe: 2, totale: 12_994.02 });
    expect(ripartizione.duplicati).toEqual({ righe: 1, totale: 9_590 });

    const testi = testiContabilizzate(ripartizione, (n) => `${n.toFixed(2)} €`);
    expect(testi.collegiale).toContain('2 posizioni per 12994.02 €');
    expect(testi.collegiale).toContain('sono lo stesso debito scritto due volte nel file');
    expect(testi.collegiale).toContain('9590.00 €');
    expect(testi.documento).toContain('contato una volta sola');
  });

  it('una riga da lavorare resta in elenco anche se la cifra è ripetuta', () => {
    // La denuncia va trasmessa: la riga è lavoro da chiedere anche quando
    // l'importo è già dichiarato dalla riga F24. Si sconta la cifra dalla
    // contabilità, non la posizione dall'elenco.
    const ripartizione = ripartisciRigheVera([
      contabilizzata(F24, '06/2026', 9_590),
      {
        voce: DENUNCE,
        stato: 'Da Verificare',
        importo: 9_590,
        trattamento: 'da_contabilizzare' as const,
        periodo: '2026-06-01',
      },
    ]);
    expect(ripartizione.daLavorare.map((r) => r.voce)).toEqual([DENUNCE]);
    expect(ripartizione.duplicati).toEqual({ righe: 0, totale: 0 });
    expect(ripartizione.contabilizzate).toEqual({ righe: 1, totale: 9_590 });
  });

  it('senza doppie scritture la dichiarazione non ne parla', () => {
    const ripartizione = ripartisciRigheVera([
      contabilizzata('TS 27 flusso Uniemens non versato', '202506 - 202506', 3_404.02),
    ]);
    expect(ripartizione.duplicati).toEqual({ righe: 0, totale: 0 });
    const testi = testiContabilizzate(ripartizione, (n) => `${n.toFixed(2)} €`);
    expect(testi.collegiale).not.toContain('due volte');
  });
});
