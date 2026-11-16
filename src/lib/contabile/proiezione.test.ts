// La proiezione contabile: voci motrici con la loro serie, voci derivate con
// le identità del prospetto. Il test che conta è quello della coerenza: EBIT =
// valore della produzione − costi, e così via, in ogni anno calcolato.

import { describe, expect, it } from 'vitest';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import { componiProiezione, passoSerie } from './proiezione';

function dati(parziale: Partial<DatiFinanziariPeriodo> = {}): DatiFinanziariPeriodo {
  const base: DatiFinanziariPeriodo = {
    ricaviVendite: 100,
    valoreProduzione: 110,
    costiProduzione: 90,
    ebit: 20,
    ammortamenti: 5,
    ebitda: 25,
    oneriFinanziari: 2,
    utileEsercizio: 8,
    totaleAttivo: 300,
    attivoCircolante: 120,
    disponibilitaLiquide: 10,
    immobilizzazioni: 180,
    patrimonioNetto: 80,
    totaleDebiti: 220,
    debitiBanche: 90,
    debitiFornitori: 60,
    debitiTributari: 30,
    debitiPrevidenziali: 40,
    passivoCorrente: 100,
    creditiClienti: 70,
  };
  return { ...base, ...parziale };
}

/** Il caso di riferimento: tre bilanci, verifica nel 2026. */
function treBilanci() {
  return [
    {
      anno: 2022,
      dati: dati({
        valoreProduzione: 100,
        ricaviVendite: 95,
        costiProduzione: 90,
        oneriFinanziari: 2,
        ammortamenti: 5,
        patrimonioNetto: 80,
        disponibilitaLiquide: 10,
        totaleDebiti: 220,
        debitiBanche: 90,
      }),
    },
    {
      anno: 2023,
      dati: dati({
        valoreProduzione: 120,
        costiProduzione: 105,
        oneriFinanziari: 2,
        patrimonioNetto: 85,
        disponibilitaLiquide: 11,
        totaleDebiti: 230,
        debitiBanche: 95,
      }),
    },
    {
      anno: 2024,
      dati: dati({
        valoreProduzione: 150,
        ricaviVendite: 140,
        costiProduzione: 130,
        oneriFinanziari: 3,
        patrimonioNetto: 90,
        disponibilitaLiquide: 12,
        totaleDebiti: 240,
        debitiBanche: 100,
      }),
    },
  ];
}

describe('proiezione contabile', () => {
  it('calcola i differenziali sulla base e li applica ai valori dell’ultimo bilancio', () => {
    // 2024 porta il 2023, il 2023 porta il 2022: la base è il 2022, perché
    // nessun file lo porta come anno precedente.
    const p = componiProiezione({ bilanci: treBilanci(), annoVerifica: 2026 });

    expect(p.annoBase).toBe(2022);
    expect(p.annoUltimoBilancio).toBe(2024);
    expect(p.annualitaCalcolate).toEqual([2025, 2026]);
    expect(p.avvertenze.join(' ')).toMatch(/La base è il 2022/);

    const vp = p.voci.find((v) => v.chiave === 'valoreProduzione')!;
    expect(vp.natura).toBe('MOTRICE');
    expect(vp.differenziali).toEqual([
      { anno: 2023, valore: 120, scarto: 20, differenziale: 0.2 },
      { anno: 2024, valore: 150, scarto: 50, differenziale: 0.5 },
    ]);
    // Un solo anno fra i due differenziali: il passo è 0,5 / 0,2 = 2,5.
    expect(vp.passo).toBeCloseTo(2.5, 4);
    // 2025: 150 × (1 + 0,5 × 2,5) = 337,5.
    expect(vp.proiezioni[0]).toMatchObject({ anno: 2025, differenziale: 1.25, valore: 337.5 });
    // 2026: 150 × (1 + 0,5 × 6,25) = 618,75.
    expect(vp.proiezioni[1].valore).toBeCloseTo(618.75, 2);
  });

  it('deriva EBIT, EBITDA, utile, patrimonio e liquidità dal prospetto, non da serie proprie', () => {
    const p = componiProiezione({ bilanci: treBilanci(), annoVerifica: 2026 });
    const perAnno = new Map(p.bilanciProiettati.map((b) => [b.anno, b.dati]));

    for (const anno of [2025, 2026]) {
      const d = perAnno.get(anno)!;
      // Le identità del prospetto, anno per anno.
      expect(d.ebit).toBeCloseTo((d.valoreProduzione ?? 0) - (d.costiProduzione ?? 0), 2);
      expect(d.ebitda).toBeCloseTo((d.ebit ?? 0) + (d.ammortamenti ?? 0), 2);
      expect(d.utileEsercizio).toBeCloseTo((d.ebit ?? 0) - (d.oneriFinanziari ?? 0), 2);
      // I ricavi seguono il valore della produzione, con lo stesso margine
      // non-ricavi dell'ultimo bilancio (150 − 140 = 10).
      expect(d.ricaviVendite).toBeCloseTo((d.valoreProduzione ?? 0) - 10, 2);
      // I debiti verso banche non superano il totale dei debiti.
      expect(d.debitiBanche ?? 0).toBeLessThanOrEqual(d.totaleDebiti ?? 0);
    }

    const d2025 = perAnno.get(2025)!;
    const d2026 = perAnno.get(2026)!;
    // Patrimonio e cassa si accumulano con l'utile, non con un tasso proprio.
    expect(d2025.patrimonioNetto).toBeCloseTo(90 + (d2025.utileEsercizio ?? 0), 2);
    expect(d2026.patrimonioNetto).toBeCloseTo(
      (d2025.patrimonioNetto ?? 0) + (d2026.utileEsercizio ?? 0),
      2
    );
    expect(d2025.disponibilitaLiquide).toBeCloseTo(12 + (d2025.utileEsercizio ?? 0), 2);
    expect(d2026.disponibilitaLiquide).toBeCloseTo(
      (d2025.disponibilitaLiquide ?? 0) + (d2026.utileEsercizio ?? 0),
      2
    );
  });

  it('non lascia un EBIT fermo mentre valore e costi crescono', () => {
    // Il difetto che questo test sorveglia: proiettare l'EBIT per conto suo lo
    // teneva a 100.000 mentre il prospetto diceva altro.
    const p = componiProiezione({ bilanci: treBilanci(), annoVerifica: 2026 });
    const ebit = p.voci.find((v) => v.chiave === 'ebit')!;

    expect(ebit.natura).toBe('DERIVATA');
    expect(ebit.passo).toBeNull();
    expect(ebit.differenziali).toEqual([]);
    expect(ebit.formula).toMatch(/valore della produzione − costi/);
    expect(ebit.proiezioni[0].valore).not.toBe(ebit.proiezioni[1].valore);
  });

  it('dichiara le motrici senza serie e resta coerente anche tenendole ferme', () => {
    // Con un biennio il passo non si ricava: le motrici restano ferme e le
    // derivate seguono quelle, invece di inventare un tasso.
    const p = componiProiezione({
      bilanci: [
        { anno: 2023, dati: dati({ valoreProduzione: 100, costiProduzione: 90 }) },
        {
          anno: 2024,
          dati: dati({
            valoreProduzione: 150,
            ricaviVendite: 140,
            costiProduzione: 130,
            oneriFinanziari: 3,
            patrimonioNetto: 90,
            disponibilitaLiquide: 12,
          }),
        },
      ],
      annoVerifica: 2025,
    });

    const vp = p.voci.find((v) => v.chiave === 'valoreProduzione')!;
    expect(vp.passo).toBeNull();
    expect(vp.motivo).toMatch(/triennio/);
    expect(p.vociTenuteFerme).toContain('Valore della produzione');

    const d = p.bilanciProiettati[p.bilanciProiettati.length - 1].dati;
    expect(d.valoreProduzione).toBe(150);
    expect(d.ebit).toBe(20);
    expect(d.utileEsercizio).toBe(17);
    expect(d.patrimonioNetto).toBe(107);
    expect(p.bilanciProiettati[p.bilanciProiettati.length - 1].tipo).toBe('CALCOLATO');
  });

  it('con base zero il differenziale percentuale non si calcola', () => {
    const bilanci = treBilanci();
    bilanci[0].dati.debitiBanche = 0;
    const p = componiProiezione({ bilanci, annoVerifica: 2025 });
    const voce = p.voci.find((v) => v.chiave === 'debitiBanche')!;
    expect(voce.differenziali.every((d) => d.differenziale === null)).toBe(true);
    expect(voce.proiettabile).toBe(false);
    expect(voce.motivo).toMatch(/base è zero/);
    // Ferma all'ultimo dato: le banche restano 100, non 0.
    expect(p.bilanciProiettati[p.bilanciProiettati.length - 1].dati.debitiBanche).toBe(100);
  });

  it('non proietta una serie che cambia segno', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati({ costiProduzione: 90 }) },
        { anno: 2023, dati: dati({ costiProduzione: 120 }) },
        { anno: 2024, dati: dati({ costiProduzione: 80 }) },
      ],
      annoVerifica: 2025,
    });
    const costi = p.voci.find((v) => v.chiave === 'costiProduzione')!;
    expect(costi.passo).toBeNull();
    expect(costi.proiettabile).toBe(false);
    expect(costi.motivo).toMatch(/segno/);
  });

  it('si ferma quando il differenziale porterebbe il valore a zero o sotto', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati({ valoreProduzione: 100 }) },
        { anno: 2023, dati: dati({ valoreProduzione: 40 }) },
        { anno: 2024, dati: dati({ valoreProduzione: 20 }) },
      ],
      annoVerifica: 2025,
    });
    const voce = p.voci.find((v) => v.chiave === 'valoreProduzione')!;
    expect(voce.proiettabile).toBe(false);
    expect(voce.motivo).toMatch(/zero o sotto/);
    expect(p.vociTenuteFerme).toContain('Valore della produzione');
  });

  it('non calcola nulla se la verifica cade dentro gli anni in archivio', () => {
    const p = componiProiezione({ bilanci: treBilanci(), annoVerifica: 2024 });
    expect(p.annualitaCalcolate).toEqual([]);
    expect(p.avvertenze.join(' ')).toMatch(/dentro gli anni già in archivio/);
  });

  it('senza bilanci non finge una base', () => {
    const p = componiProiezione({ bilanci: [], annoVerifica: 2026 });
    expect(p.annoBase).toBeNull();
    expect(p.proiettabile).toBe(false);
    expect(p.avvertenze[0]).toMatch(/Carica i bilanci XBRL/);
  });

  it('split del personale: salari e stipendi seguono i costi, oneri sociali ricevono la quota dell’ente', () => {
    const bilanci = treBilanci();
    bilanci[2].dati.salariStipendi = 40;
    bilanci[2].dati.oneriSociali = 12;
    bilanci[2].dati.costiPersonale = 52;

    const p = componiProiezione({
      bilanci,
      annoVerifica: 2026,
      debitoEnte: { totale: 130, fonte: 'verifica amministrativa', accertatoIl: '2026-01-10' },
    });
    const perAnno = new Map(p.bilanciProiettati.map((b) => [b.anno, b.dati]));
    const d2025 = perAnno.get(2025)!;
    const d2026 = perAnno.get(2026)!;
    const quota2025 = p.ponteEnte!.quote[0]?.quota ?? 0;
    const ratio2025 = (d2025.costiProduzione! - quota2025) / 130;

    // Salari e stipendi si riportano nella proporzione dei costi, senza la quota.
    expect(d2025.salariStipendi).toBeCloseTo(40 * ratio2025, 2);
    // Gli oneri sociali restano il valore depositato, riportato: nessuna aggiunta.
    expect(d2025.oneriSociali).toBeCloseTo(12 * ratio2025, 2);
    expect(d2025.costiPersonale).toBeCloseTo(52 * ratio2025, 2);
    // La quota ricostruita ha una riga sua, distinta dagli oneri sociali.
    expect(d2025.voceEnte).toBeCloseTo(quota2025, 2);
    expect(d2025.voceEnte).toBeGreaterThan(0);
    // Il totale dei costi tiene conto di entrambe le cose: personale depositato più voce dell’ente.
    expect(d2025.costiProduzione!).toBeCloseTo(130 * ratio2025 + quota2025, 2);
    // Gli oneri sociali crescono con i costi, la quota con gli oneri proiettati.
    expect(d2026.oneriSociali!).toBeGreaterThan(d2025.oneriSociali!);
    expect(d2026.voceEnte!).toBeGreaterThan(0);
  });

  it('la voce dell’ente chiude esattamente sullo stock accertato alla data della verifica', () => {
    const p = componiProiezione({
      bilanci: treBilanci(),
      annoVerifica: 2026,
      debitoEnte: { totale: 130, fonte: 'verifica amministrativa', accertatoIl: '2026-01-10' },
    });
    const ponte = p.ponteEnte!;

    // L’ultimo bilancio dichiara 30 + 40 = 70: la differenza è 60.
    expect(ponte.debitoContabileUltimo).toBe(70);
    expect(ponte.debitoVerificato).toBe(130);
    expect(ponte.differenza).toBe(60);
    expect(ponte.applicato).toBe(true);
    expect(ponte.quote.map((q) => q.anno)).toEqual([2025, 2026]);
    // La somma delle quote è la differenza, senza residui di arrotondamento.
    expect(ponte.quote.reduce((a, q) => a + q.quota, 0)).toBe(60);

    // Alla data della verifica le due voci del passivo tornano allo stock.
    const finali = p.bilanciProiettati.find((b) => b.anno === 2026)!.dati;
    expect((finali.debitiTributari ?? 0) + (finali.debitiPrevidenziali ?? 0)).toBe(130);
    // La voce dell’ente nel conto economico somma esattamente alla differenza.
    const sommaVociEnte = p.bilanciProiettati
      .filter((b) => b.tipo === 'CALCOLATO')
      .reduce((a, b) => a + (b.dati.voceEnte ?? 0), 0);
    expect(Math.round(sommaVociEnte)).toBe(60);
    // Il debito entra anche nel totale, e l’onere nei costi: stessa cifra, due lati.
    // La riga del prospetto porta già la crescita accumulata (60).
    const totaleRiga = p.voci.find((v) => v.chiave === 'totaleDebiti')!.proiezioni[1].valore;
    expect(finali.totaleDebiti).toBeCloseTo(totaleRiga, 0);
    // Il totale del 2026 è quello del 2024 (240) più la serie e più la quota:
    // senza il ponte sarebbe 327,27, con il ponte 387,27.
    expect(totaleRiga).toBeGreaterThan(380);
  });

  it('non ricostruisce una crescita che non c’è e lo dichiara', () => {
    const p = componiProiezione({
      bilanci: treBilanci(),
      annoVerifica: 2026,
      debitoEnte: { totale: 70 },
    });
    expect(p.ponteEnte?.applicato).toBe(false);
    expect(p.ponteEnte?.differenza).toBe(0);
    expect(p.ponteEnte?.motivo).toMatch(/non è inferiore/);
    expect(p.avvertenze.join(' ')).toMatch(/Voce dell’ente non ricostruita/);
  });

  it('senza debito memorizzato il ponte è null, non zero', () => {
    const p = componiProiezione({ bilanci: treBilanci(), annoVerifica: 2026 });
    expect(p.ponteEnte).toBeNull();
    expect(p.avvertenze.join(' ')).toMatch(/Nessun debito dell’ente memorizzato/);
  });

  it('le righe motrici toccate dal ponte portano la quota: il prospetto somma', () => {
    const p = componiProiezione({
      bilanci: treBilanci(),
      annoVerifica: 2026,
      debitoEnte: { totale: 130 },
    });
    const costi = p.voci.find((v) => v.chiave === 'costiProduzione')!;
    const debiti = p.voci.find((v) => v.chiave === 'totaleDebiti')!;
    const d = p.bilanciProiettati.find((b) => b.anno === 2026)!.dati;
    const costi2026 = costi.proiezioni.find((x) => x.anno === 2026)!.valore;

    // La riga del prospetto e il dato che alimenta l’EBIT sono lo stesso numero.
    expect(costi2026).toBeCloseTo(d.costiProduzione!, 2);
    expect(debiti.proiezioni.find((x) => x.anno === 2026)!.valore).toBeCloseTo(d.totaleDebiti!, 2);
    // Il conto che il lettore fa sulle righe è quello del motore.
    expect((d.valoreProduzione ?? 0) - costi2026).toBeCloseTo(d.ebit!, 2);
  });

  it('il passo è la radice n-esima del rapporto fra ultimo e primo differenziale', () => {
    const punto = (anno: number, differenziale: number) => ({
      anno,
      valore: 0,
      scarto: 0,
      differenziale,
    });
    expect(passoSerie([punto(2023, 0.1), punto(2025, 0.4)])).toBeCloseTo(2, 5);
    // Un solo differenziale: niente passo.
    expect(passoSerie([punto(2024, 0.3)])).toBeNull();
    // Serie che cambia segno: non è geometrica.
    expect(passoSerie([punto(2023, 0.2), punto(2024, -0.1)])).toBeNull();
  });
});
