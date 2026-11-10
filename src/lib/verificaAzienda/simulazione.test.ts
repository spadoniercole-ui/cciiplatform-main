import { describe, expect, it } from 'vitest';
import {
  colonneSimulazione,
  crescitaStorica,
  cresciteProfilo,
  ANNUALITA_PREDEFINITE,
} from './simulazione';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

const dati = (p: Partial<DatiFinanziariPeriodo> = {}): DatiFinanziariPeriodo =>
  ({
    ricaviVendite: 1_000_000,
    valoreProduzione: 1_100_000,
    costiProduzione: 900_000,
    ammortamenti: 40_000,
    ebit: 200_000,
    ebitda: 240_000,
    oneriFinanziari: 30_000,
    utileEsercizio: 170_000,
    patrimonioNetto: 400_000,
    totaleDebiti: 1_500_000,
    passivoCorrente: 600_000,
    disponibilitaLiquide: 100_000,
    debitiBanche: 700_000,
    debitiFornitori: 300_000,
    debitiTributari: 100_000,
    debitiPrevidenziali: 200_000,
    altriDebiti: 200_000,
    ...p,
  }) as DatiFinanziariPeriodo;

const anni = [
  {
    anno: 2022,
    dati: dati({ ricaviVendite: 800_000, valoreProduzione: 880_000, costiProduzione: 720_000 }),
  },
  {
    anno: 2023,
    dati: dati({ ricaviVendite: 900_000, valoreProduzione: 990_000, costiProduzione: 810_000 }),
  },
  { anno: 2024, dati: dati() },
];

describe('crescitaStorica', () => {
  it('calcola il CAGR fra primo e ultimo anno', () => {
    const c = crescitaStorica(anni);
    expect(c).not.toBeNull();
    // da 800.000 a 1.000.000 in due anni: circa 11,8% annuo.
    expect(c!).toBeGreaterThan(11);
    expect(c!).toBeLessThan(12.5);
  });

  it('non calcola nulla con un solo anno o con ricavi non positivi', () => {
    expect(crescitaStorica([anni[0]])).toBeNull();
    expect(
      crescitaStorica([
        { anno: 2023, dati: dati({ ricaviVendite: 0 }) },
        { anno: 2024, dati: dati() },
      ])
    ).toBeNull();
  });
});

describe('cresciteProfilo', () => {
  it('il migliorativo cresce più dello standard, il peggiorativo meno', () => {
    const standard = cresciteProfilo('STANDARD', 10);
    const migliorativo = cresciteProfilo('MIGLIORATIVO', 10);
    const peggiorativo = cresciteProfilo('PEGGIORATIVO', 10);
    expect(standard.ricaviPct).toBe(10);
    expect(migliorativo.ricaviPct).toBe(13);
    expect(peggiorativo.ricaviPct).toBe(7);
  });

  it('nel migliorativo i costi crescono meno dei ricavi, nel peggiorativo più', () => {
    expect(cresciteProfilo('MIGLIORATIVO', 10).costiPct).toBe(11);
    expect(cresciteProfilo('PEGGIORATIVO', 10).costiPct).toBe(9);
  });

  it('limita la crescita all’intervallo dichiarato', () => {
    expect(cresciteProfilo('MIGLIORATIVO', 24).ricaviPct).toBe(25);
    expect(cresciteProfilo('PEGGIORATIVO', -24).ricaviPct).toBe(-25);
  });
});

describe('colonneSimulazione', () => {
  it('affianca gli anni storici e le proiezioni, con gli indici per colonna', () => {
    const esito = colonneSimulazione({
      anni,
      profilo: 'STANDARD',
      annualita: 3,
      debitoEnte: 300_000,
    });
    expect(esito.motivo).toBeNull();
    expect(esito.colonne).toHaveLength(6);
    expect(esito.colonne.slice(0, 3).every((c) => c.tipo === 'STORICO')).toBe(true);
    expect(esito.colonne.slice(3).map((c) => c.anno)).toEqual([2025, 2026, 2027]);
    for (const c of esito.colonne) expect(c.indici.length).toBeGreaterThan(0);
  });

  it('iscrive il debito dell’ente una volta sola, nella prima proiezione', () => {
    const esito = colonneSimulazione({
      anni,
      profilo: 'STANDARD',
      annualita: 3,
      debitoEnte: 300_000,
    });
    const proiezioni = esito.colonne.filter((c) => c.tipo === 'PROIEZIONE');
    expect(proiezioni[0].debitoEnteInserito).toBe(300_000);
    expect(proiezioni[1].debitoEnteInserito).toBe(0);
    const storica = esito.colonne[2];
    expect(proiezioni[0].dati.totaleDebiti).toBe(storica.dati.totaleDebiti + 300_000);
    expect(proiezioni[1].dati.totaleDebiti).toBe(proiezioni[0].dati.totaleDebiti);
  });

  it('il patrimonio netto segue il risultato, non lo sostituisce', () => {
    const esito = colonneSimulazione({ anni, profilo: 'STANDARD', annualita: 1, debitoEnte: 0 });
    const ultimoStorico = esito.colonne[2];
    const proiezione = esito.colonne[3];
    expect(proiezione.dati.patrimonioNetto).toBe(
      ultimoStorico.dati.patrimonioNetto +
        (proiezione.dati.utileEsercizio - ultimoStorico.dati.utileEsercizio)
    );
  });

  it('il migliorativo produce un EBITDA maggiore del peggiorativo', () => {
    const migliore = colonneSimulazione({
      anni,
      profilo: 'MIGLIORATIVO',
      annualita: 3,
      debitoEnte: 0,
    });
    const peggiore = colonneSimulazione({
      anni,
      profilo: 'PEGGIORATIVO',
      annualita: 3,
      debitoEnte: 0,
    });
    expect(migliore.colonne[5].dati.ebitda).toBeGreaterThan(peggiore.colonne[5].dati.ebitda);
  });

  it('dichiara l’assenza del debito senza mettere zero al suo posto', () => {
    const esito = colonneSimulazione({ anni, profilo: 'STANDARD', annualita: 2, debitoEnte: 0 });
    expect(esito.debitoEnte).toBe(0);
    expect(esito.avvertenze.join(' ')).toContain('Nessun debito dell’ente memorizzato');
  });

  it('senza bilanci non inventa colonne, e dice perché', () => {
    const esito = colonneSimulazione({
      anni: [],
      profilo: 'STANDARD',
      annualita: 3,
      debitoEnte: 0,
    });
    expect(esito.colonne).toHaveLength(0);
    expect(esito.motivo).toContain('Nessun bilancio XBRL');
  });

  it('riconduce le annualità nell’intervallo ammesso', () => {
    expect(
      colonneSimulazione({ anni, profilo: 'STANDARD', annualita: 99, debitoEnte: 0 }).annualita
    ).toBe(8);
    expect(
      colonneSimulazione({ anni, profilo: 'STANDARD', annualita: 0, debitoEnte: 0 }).colonne
    ).toHaveLength(3 + 1);
    expect(ANNUALITA_PREDEFINITE).toBe(3);
  });
});
