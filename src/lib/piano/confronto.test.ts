import { describe, it, expect } from 'vitest';
import { calcolaPiano, type EsercizioStorico } from './piano';
import {
  crescitaDaSerie,
  crescitaDiRiferimento,
  ipotesiAutomatiche,
  LIMITE_TASSO,
} from './automatico';
import { confrontaPiani, semaforo, soglieValide, SOGLIE_PREDEFINITE } from './confronto';
import {
  leggiPianoExcel,
  proponiDestinazione,
  valoriDaVoci,
  ipotesiDaPianoAzienda,
  anniDelPiano,
  valoriPuliti,
  type DestinazioneVoce,
} from './pianoAziendale';

const STORICO: EsercizioStorico = {
  anno: 2025,
  ricaviVendite: 1_000_000,
  valoreProduzione: 1_050_000,
  costiProduzione: 950_000,
  ammortamenti: 50_000,
  oneriFinanziari: 20_000,
  utileEsercizio: 60_000,
  immobilizzazioni: 400_000,
  creditiClienti: 250_000,
  disponibilitaLiquide: 30_000,
  attivoCircolante: 400_000,
  totaleAttivo: 800_000,
  patrimonioNetto: 100_000,
  debitiBanche: 300_000,
  debitiFornitori: 200_000,
  debitiTributari: 50_000,
  debitiPrevidenziali: 80_000,
  totaleDebiti: 700_000,
};
const RATE = { ente: [10_000, 10_000, 10_000], altri: [0, 0, 0] };

describe('crescita di riferimento', () => {
  it('tasso composto dalla serie ISTAT, medie annuali', () => {
    const punti = [
      { periodo: '2021-01', valore: 100 },
      { periodo: '2021-07', valore: 100 },
      { periodo: '2023-01', valore: 121 },
    ];
    expect(crescitaDaSerie(punti)?.tasso).toBeCloseTo(10, 5);
  });
  it('settore, poi azienda, poi zero; tasso limitato', () => {
    expect(
      crescitaDiRiferimento(
        [
          { periodo: '2020', valore: 100 },
          { periodo: '2021', valore: 103 },
        ],
        'C25',
        [STORICO]
      ).fonte
    ).toBe('settore');
    const az = crescitaDiRiferimento(null, null, [
      STORICO,
      { ...STORICO, anno: 2023, ricaviVendite: 826_446.28 },
    ]);
    expect(az.fonte).toBe('azienda');
    expect(az.tasso).toBeCloseTo(10, 1);
    expect(crescitaDiRiferimento([], null, [STORICO])).toMatchObject({
      fonte: 'nessuna',
      tasso: 0,
    });
    const alto = crescitaDiRiferimento(
      [
        { periodo: '2020', valore: 100 },
        { periodo: '2021', valore: 200 },
      ],
      null,
      []
    );
    expect(alto.tasso).toBe(LIMITE_TASSO);
    expect(alto.tassoGrezzo).toBe(100);
  });
  it('piano automatico: margini costanti, investimenti pari agli ammortamenti', () => {
    const ip = ipotesiAutomatiche(STORICO, 3, 5);
    const p = calcolaPiano(STORICO, 3, ip, RATE);
    expect(p.anni[0].ricaviVendite).toBe(1_050_000);
    expect(p.anni[0].costiOperativi).toBe(945_000); // 900.000 × 1,05
    expect(p.anni[0].investimenti).toBe(50_000);
    expect(p.anni[2].ricaviVendite).toBeCloseTo(1_157_625, 0);
  });
});

describe('semafori per direzione', () => {
  const s = SOGLIE_PREDEFINITE;
  it('ricavi più alti: verde fino al 10%, giallo fino al 25%, rosso oltre', () => {
    expect(semaforo(100_000, 109_000, 'alto', s).luce).toBe('verde');
    expect(semaforo(100_000, 120_000, 'alto', s).luce).toBe('giallo');
    expect(semaforo(100_000, 130_000, 'alto', s)).toEqual({ ottimismo: 30, luce: 'rosso' });
  });
  it('direzione prudente sempre verde', () => {
    expect(semaforo(100_000, 50_000, 'alto', s).luce).toBe('verde');
    expect(semaforo(100_000, 180_000, 'basso', s).luce).toBe('verde');
  });
  it('costi più bassi del riferimento = ottimismo', () => {
    expect(semaforo(100_000, 70_000, 'basso', s)).toEqual({ ottimismo: 30, luce: 'rosso' });
  });
  it('riferimento nullo: non confrontabile', () => {
    expect(semaforo(0, 5000, 'alto', s).luce).toBe('nc');
    expect(semaforo(0, 0, 'alto', s).luce).toBe('verde');
  });
  it('soglie dell’ente validate', () => {
    expect(soglieValide({ verde: 5, giallo: 15 })).toEqual({ verde: 5, giallo: 15 });
    expect(soglieValide({ verde: 30, giallo: 20 })).toEqual({ verde: 30, giallo: 31 });
    expect(soglieValide(null)).toEqual(SOGLIE_PREDEFINITE);
  });
});

describe('confronto dei piani', () => {
  it('piano aziendale ottimista sui ricavi: rosso sui ricavi, righe non indicate segnate', () => {
    const auto = calcolaPiano(STORICO, 3, ipotesiAutomatiche(STORICO, 3, 2), RATE);
    const valori = {
      ricaviVendite: { '2026': 1_300_000, '2027': 1_450_000, '2028': 1_600_000 },
      costiOperativi: { '2026': 950_000, '2027': 1_000_000, '2028': 1_050_000 },
    };
    const ipAz = ipotesiDaPianoAzienda(valori, 2026, 3);
    const az = calcolaPiano(STORICO, 3, ipAz, RATE);
    const esito = confrontaPiani(auto.anni, az.anni, ipAz, SOGLIE_PREDEFINITE);
    const ricavi = esito.righe.find((r) => r.riga.chiave === 'ricaviVendite')!;
    expect(ricavi.peggiore).toBe('rosso');
    expect(ricavi.celle[0].ottimismo).toBeCloseTo(27.5, 1);
    const crediti = esito.righe.find((r) => r.riga.chiave === 'creditiClienti')!;
    expect(crediti.nonIndicata).toBe(true);
    expect(crediti.peggiore).toBe('nc');
    expect(esito.sintesi).toMatch(/ricavi delle vendite/);
  });
  it('piano dell’operatore (Redigente): nessuna riga «non indicata»', () => {
    const auto = calcolaPiano(STORICO, 3, ipotesiAutomatiche(STORICO, 3, 2), RATE);
    const mio = calcolaPiano(STORICO, 3, { ricaviVendite: [{ tipo: 'pct', valore: 30 }] }, RATE);
    const esito = confrontaPiani(auto.anni, mio.anni, null, SOGLIE_PREDEFINITE);
    expect(esito.righe.every((r) => !r.nonIndicata)).toBe(true);
    expect(esito.righe.find((r) => r.riga.chiave === 'ricaviVendite')!.celle[0].luce).toBe('rosso');
    // crediti fermi mentre il riferimento cresce: più bassi = più favorevole, +2% → verde
    expect(esito.righe.find((r) => r.riga.chiave === 'creditiClienti')!.celle[0].luce).toBe(
      'verde'
    );
  });
  it('anni senza dati dell’azienda: non confrontati', () => {
    const auto = calcolaPiano(STORICO, 3, ipotesiAutomatiche(STORICO, 3, 2), RATE);
    const valori = { ricaviVendite: { '2027': 1_300_000, '2028': 1_450_000 } };
    const ipAz = ipotesiDaPianoAzienda(valori, 2026, 3);
    const az = calcolaPiano(STORICO, 3, ipAz, RATE);
    const esito = confrontaPiani(
      auto.anni,
      az.anni,
      ipAz,
      SOGLIE_PREDEFINITE,
      new Set([2027, 2028])
    );
    const ricavi = esito.righe.find((r) => r.riga.chiave === 'ricaviVendite')!;
    expect(ricavi.celle.map((c) => c.luce)).toEqual(['nc', 'giallo', 'rosso']); // 2027: +24,9% sul riferimento;
    const ebitda = esito.righe.find((r) => r.riga.chiave === 'ebitda')!;
    expect(ebitda.celle[0].luce).toBe('nc');
  });
});

describe('piano aziendale da Excel', () => {
  const FILE: unknown[][] = [
    ['Piano industriale 2026-2028 (valori in migliaia di euro)'],
    ['Voce', 'Consuntivo 2025', 'Budget 2026', '2027E', '2028E'],
    ['Ricavi delle vendite', 1000, 1100, 1210, 1331],
    ['Costi per materie prime', -400, -440, -480, -520],
    ['Costi per servizi', -200, -210, -220, -230],
    ['Costo del personale', -300, -310, -320, -330],
    ['EBITDA', 100, 140, 190, 251],
    ['Ammortamenti', -50, -50, -55, -55],
    ['Interessi passivi', -20, -18, -16, -14],
    ['Utile netto', 20, 50, 90, 130],
    ['Investimenti', 0, 80, 40, 40],
  ];
  it('anni in colonna, etichette, unità in migliaia', () => {
    const l = leggiPianoExcel(FILE)!;
    expect(l.rigaAnni).toBe(1);
    expect(l.colonnaEtichetta).toBe(0);
    expect(Object.values(l.anni)).toEqual([2025, 2026, 2027, 2028]);
    expect(l.unitaSuggerita).toBe(1000);
    expect(l.voci).toHaveLength(9);
  });
  it('abbinamento proposto e somma delle voci di costo', () => {
    const l = leggiPianoExcel(FILE)!;
    const abb: Record<string, DestinazioneVoce | undefined> = {};
    for (const v of l.voci) abb[v.chiave] = proponiDestinazione(v.etichetta) ?? undefined;
    expect(abb['ebitda']).toBe('esclusa');
    expect(abb['utile netto']).toBe('esclusa');
    expect(abb['costo del personale']).toBe('costiOperativi');
    expect(abb['interessi passivi']).toBe('oneriFinanziari');
    const val = valoriDaVoci(l.voci, abb, l.unitaSuggerita);
    expect(val.costiOperativi?.['2026']).toBe(960_000);
    expect(val.ricaviVendite?.['2028']).toBe(1_331_000);
    expect(val.ammortamenti?.['2027']).toBe(55_000);
    expect(anniDelPiano(val)).toEqual([2025, 2026, 2027, 2028]);
    const ip = ipotesiDaPianoAzienda(val, 2026, 3);
    expect(ip.ricaviVendite?.[0]).toEqual({ tipo: 'abs', valore: 1_100_000 });
    expect(ip.creditiClienti).toBeUndefined();
  });
  it('costi della produzione comprensivi di ammortamenti: si toglie l’ammortamento', () => {
    const voci = [
      { chiave: 'b', etichetta: 'Costi della produzione', riga: 1, valori: { '2026': 1000 } },
      { chiave: 'a', etichetta: 'Ammortamenti', riga: 2, valori: { '2026': 100 } },
    ];
    const v = valoriDaVoci(voci, { b: 'costiProduzioneTotali', a: 'ammortamenti' }, 1);
    expect(v.costiOperativi?.['2026']).toBe(900);
  });
  it('valori puliti: solo righe e anni ammessi', () => {
    expect(
      valoriPuliti({ ricaviVendite: { '2026': '1.200,50', pippo: 3 }, ebitda: { '2026': 1 } })
    ).toEqual({
      ricaviVendite: { '2026': 1200.5 },
    });
  });
});
