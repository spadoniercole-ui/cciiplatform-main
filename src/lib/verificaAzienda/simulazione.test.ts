import { describe, expect, it } from 'vitest';
import {
  colonneSimulazione,
  crescitaStorica,
  cresciteProfilo,
  traiettoriaCrescite,
  ANNUALITA_PREDEFINITE,
  DECADIMENTO_CRESCITA,
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
    const standard = cresciteProfilo('STANDARD', 10, 8);
    const migliorativo = cresciteProfilo('MIGLIORATIVO', 10, 8);
    const peggiorativo = cresciteProfilo('PEGGIORATIVO', 10, 8);
    expect(standard.ricaviPct).toBe(10);
    expect(migliorativo.ricaviPct).toBe(13);
    expect(peggiorativo.ricaviPct).toBe(7);
  });

  it('i costi seguono le loro basi, non quelle dei ricavi', () => {
    expect(cresciteProfilo('STANDARD', 10, 8).costiPct).toBe(8);
    expect(cresciteProfilo('MIGLIORATIVO', 10, 8).costiPct).toBe(6);
    expect(cresciteProfilo('PEGGIORATIVO', 10, 8).costiPct).toBe(10);
  });

  it('limita la crescita all’intervallo dichiarato', () => {
    expect(cresciteProfilo('MIGLIORATIVO', 24, 10).ricaviPct).toBe(25);
    expect(cresciteProfilo('PEGGIORATIVO', -24, 10).ricaviPct).toBe(-25);
  });
});

describe('traiettoriaCrescite', () => {
  it('parte dalla storica e converge verso il settore, anno dopo anno', () => {
    const t = traiettoriaCrescite({
      storica: 12,
      settore: 2,
      profilo: 'STANDARD',
      annualita: 4,
    });

    expect(t.map((a) => a.ricaviPct)).toEqual([12, 8, 5.6, 4.16]);
    expect(DECADIMENTO_CRESCITA).toBe(0.6);
    // La riga non è più parallela: la crescita rallenta.
    expect(t[0].ricaviPct).toBeGreaterThan(t[3].ricaviPct);
  });

  it('senza settore converge verso ricavi invariati, non resta costante', () => {
    const t = traiettoriaCrescite({
      storica: 12,
      settore: null,
      profilo: 'STANDARD',
      annualita: 3,
    });

    expect(t.map((a) => a.ricaviPct)).toEqual([12, 7.2, 4.32]);
  });

  it('il profilo sposta la traiettoria di una misura dichiarata, senza cambiarne la forma', () => {
    const standard = traiettoriaCrescite({
      storica: 10,
      settore: 2,
      profilo: 'STANDARD',
      annualita: 3,
    });
    const migliorativo = traiettoriaCrescite({
      storica: 10,
      settore: 2,
      profilo: 'MIGLIORATIVO',
      annualita: 3,
    });

    migliorativo.forEach((a, i) => {
      expect(a.ricaviPct).toBe(standard[i].ricaviPct + 3);
      // I costi hanno la loro traiettoria: il migliorativo li abbassa di 2
      // punti rispetto allo standard, non li fa crescere come i ricavi.
      expect(a.costiPct).toBeCloseTo(standard[i].costiPct - 2, 6);
    });
  });

  it('ricavi e costi non viaggiano sulla stessa curva: la loro storia è diversa', () => {
    const t = traiettoriaCrescite({
      storica: 20,
      storicaCosti: 12,
      settore: 2,
      profilo: 'STANDARD',
      annualita: 3,
    });

    // I ricavi arrivano al settore (2%), i costi a 2% × elasticità (1,7%).
    expect(t[0].ricaviPct).toBe(20);
    expect(t[0].costiPct).toBe(12);
    expect(t[2].ricaviPct).toBeGreaterThan(t[2].costiPct);
    expect(t[0].costiPct).not.toBe(t[0].ricaviPct);
  });

  it('senza storico né settore parte da zero e lo dichiara nel profilo', () => {
    const t = traiettoriaCrescite({
      storica: null,
      settore: null,
      profilo: 'STANDARD',
      annualita: 2,
    });

    expect(t.map((a) => a.ricaviPct)).toEqual([0, 0]);
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

  it('iscrive il debito dell’ente una volta sola e lo estingue a rate', () => {
    const esito = colonneSimulazione({
      anni,
      profilo: 'STANDARD',
      annualita: 3,
      debitoEnte: 300_000,
    });
    const proiezioni = esito.colonne.filter((c) => c.tipo === 'PROIEZIONE');
    const storica = esito.colonne[2];

    expect(proiezioni[0].debitoEnteInserito).toBe(300_000);
    expect(proiezioni[0].dati.totaleDebiti).toBe(storica.dati.totaleDebiti + 300_000);
    expect(proiezioni.slice(1).every((c) => c.debitoEnteInserito === 0)).toBe(true);

    // Tre rate da 100.000: il passivo flette, non resta piatto.
    expect(proiezioni[1].rimborsoDebitoEnte).toBe(100_000);
    expect(proiezioni[1].dati.totaleDebiti).toBe(proiezioni[0].dati.totaleDebiti - 100_000);
    expect(proiezioni[2].dati.totaleDebiti).toBe(storica.dati.totaleDebiti + 100_000);
    expect(proiezioni[2].debitoEnteResiduo).toBe(100_000);
  });

  it('il rimborso del debito non è una crescita: il debito scende sempre', () => {
    const esito = colonneSimulazione({
      anni,
      profilo: 'STANDARD',
      annualita: 4,
      debitoEnte: 300_000,
    });
    const debiti = esito.colonne
      .filter((c) => c.tipo === 'PROIEZIONE')
      .map((c) => c.dati.totaleDebiti);

    for (let i = 1; i < debiti.length; i++) expect(debiti[i]).toBeLessThan(debiti[i - 1]);
  });

  it('la cassa segue il risultato e i rimborsi, non resta ferma', () => {
    const esito = colonneSimulazione({ anni, profilo: 'STANDARD', annualita: 1, debitoEnte: 0 });
    const utlimoStorico = esito.colonne[2];
    const proiezione = esito.colonne[3];

    expect(proiezione.dati.disponibilitaLiquide).toBe(
      utlimoStorico.dati.disponibilitaLiquide + proiezione.dati.utileEsercizio
    );
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

  it('usa il settore come destinazione e lo dichiara', () => {
    const esito = colonneSimulazione({
      anni,
      profilo: 'STANDARD',
      annualita: 3,
      debitoEnte: 0,
      crescitaSettorePct: 2,
    });

    expect(esito.fonteCrescita).toBe('SETTORE');
    expect(esito.crescitaSettorePct).toBe(2);
    const proiezioni = esito.colonne.filter((c) => c.tipo === 'PROIEZIONE');
    expect(proiezioni[0].crescitaRicaviPct).toBeGreaterThan(proiezioni[2].crescitaRicaviPct);
  });

  it('il decadimento configurabile cambia la velocità di convergenza', () => {
    const rapida = colonneSimulazione({
      anni,
      profilo: 'STANDARD',
      annualita: 3,
      debitoEnte: 0,
      crescitaSettorePct: 2,
      decadimentoCrescita: 0,
    });
    const lenta = colonneSimulazione({
      anni,
      profilo: 'STANDARD',
      annualita: 3,
      debitoEnte: 0,
      crescitaSettorePct: 2,
      decadimentoCrescita: 0.9,
    });
    const ricavi = (e: typeof rapida) =>
      e.colonne.filter((c) => c.tipo === 'PROIEZIONE').map((c) => c.crescitaRicaviPct);

    // Con decadimento 0 la seconda annualità è già al tasso di settore.
    expect(ricavi(rapida)[1]).toBe(2);
    expect(ricavi(lenta)[1]).toBeGreaterThan(ricavi(rapida)[1]);
  });

  it('le rate di rientro configurabili cambiano il piano del debito', () => {
    const esito = colonneSimulazione({
      anni,
      profilo: 'STANDARD',
      annualita: 2,
      debitoEnte: 300_000,
      anniRientroDebito: 1,
    });
    const proiezioni = esito.colonne.filter((c) => c.tipo === 'PROIEZIONE');

    expect(proiezioni[1].rimborsoDebitoEnte).toBe(300_000);
    expect(proiezioni[1].debitoEnteResiduo).toBe(0);
  });

  it('limita decadimento e rate all’intervallo dichiarato', () => {
    expect(
      colonneSimulazione({
        anni,
        profilo: 'STANDARD',
        annualita: 2,
        debitoEnte: 0,
        decadimentoCrescita: 5,
      }).decadimentoCrescita
    ).toBe(0.9);
    expect(
      colonneSimulazione({
        anni,
        profilo: 'STANDARD',
        annualita: 2,
        debitoEnte: 0,
        anniRientroDebito: 99,
      }).anniRientroDebito
    ).toBe(8);
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
