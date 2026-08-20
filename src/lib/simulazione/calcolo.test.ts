import { describe, it, expect } from 'vitest';
import {
  calcolaCagr,
  calcolaCrescitaStoricaAzienda,
  calcolaCrescitaStoricaSettore,
  calcolaRataAnnua,
  calcolaSimulazione,
  calcolaMesiCoperti,
  annualizzaPuntoStorico,
  LEVE_VUOTE,
} from './calcolo';

describe('calcolaMesiCoperti', () => {
  it('legge il mese dalla data di riferimento', () => {
    expect(calcolaMesiCoperti('2026-06-30')).toBe(6);
    expect(calcolaMesiCoperti('2026-03-31')).toBe(3);
    expect(calcolaMesiCoperti('2026-12-31')).toBe(12);
  });

  it('non ritorna mai zero (evita divisioni per zero)', () => {
    expect(calcolaMesiCoperti('2026-01-01')).toBe(1);
  });
});

describe('annualizzaPuntoStorico', () => {
  it('moltiplica le voci di flusso per 12/mesiCoperti', () => {
    const trimestre = {
      ricaviVendite: 23070354.25,
      ebitda: 336805.5,
      ebit: 294255,
      ammortamenti: 42550.5,
    };
    const annualizzato = annualizzaPuntoStorico(trimestre, 3);
    // 23.070.354,25 * 4 = 92.281.417 — deve tornare vicino al dato dell'anno intero corrispondente
    expect(annualizzato.ricaviVendite).toBeCloseTo(92281417, 0);
  });

  it('non tocca un punto già a 12 mesi', () => {
    const annuale = { ricaviVendite: 1000000, ebitda: 100000, ebit: 70000, ammortamenti: 30000 };
    expect(annualizzaPuntoStorico(annuale, 12)).toEqual(annuale);
  });
});

describe('calcolaCagr', () => {
  it('calcola correttamente una crescita su 2 intervalli', () => {
    expect(calcolaCagr(100, 121, 2)).toBeCloseTo(0.1, 5);
  });

  it('ritorna null se il valore iniziale non è positivo', () => {
    expect(calcolaCagr(0, 100, 2)).toBeNull();
    expect(calcolaCagr(-10, 100, 2)).toBeNull();
  });

  it('ritorna null se non ci sono intervalli', () => {
    expect(calcolaCagr(100, 110, 0)).toBeNull();
  });

  it('gestisce una crescita negativa', () => {
    expect(calcolaCagr(100, 81, 2)).toBeCloseTo(-0.1, 5);
  });
});

describe('calcolaCrescitaStoricaAzienda', () => {
  it("usa il primo e l'ultimo punto validi", () => {
    const punti = [
      { ricaviVendite: 1000, ebitda: 100, ebit: 80, ammortamenti: 20 },
      { ricaviVendite: 1100, ebitda: 110, ebit: 88, ammortamenti: 22 },
      { ricaviVendite: 1210, ebitda: 121, ebit: 97, ammortamenti: 24 },
    ];
    expect(calcolaCrescitaStoricaAzienda(punti)).toBeCloseTo(0.1, 5);
  });

  it('ritorna null con meno di 2 punti validi', () => {
    expect(
      calcolaCrescitaStoricaAzienda([
        { ricaviVendite: 1000, ebitda: 100, ebit: 80, ammortamenti: 20 },
      ])
    ).toBeNull();
  });

  it('ignora i punti senza ricavi (bilancio non ancora caricato)', () => {
    const punti = [
      { ricaviVendite: 0, ebitda: 0, ebit: 0, ammortamenti: 0 },
      { ricaviVendite: 1000, ebitda: 100, ebit: 80, ammortamenti: 20 },
      { ricaviVendite: 1100, ebitda: 110, ebit: 88, ammortamenti: 22 },
    ];
    expect(calcolaCrescitaStoricaAzienda(punti)).toBeCloseTo(0.1, 5);
  });
});

describe('calcolaCrescitaStoricaSettore', () => {
  it("aggrega per anno e calcola il CAGR tra il primo e l'ultimo anno", () => {
    const punti = [
      { periodo: '2023-01', valore: 100 },
      { periodo: '2023-06', valore: 100 },
      { periodo: '2024-01', valore: 105 },
      { periodo: '2024-06', valore: 105 },
    ];
    expect(calcolaCrescitaStoricaSettore(punti)).toBeCloseTo(0.05, 5);
  });

  it('ritorna null se la serie copre un solo anno', () => {
    const punti = [
      { periodo: '2023-01', valore: 100 },
      { periodo: '2023-06', valore: 105 },
    ];
    expect(calcolaCrescitaStoricaSettore(punti)).toBeNull();
  });
});

describe('calcolaRataAnnua', () => {
  it('calcola la rata annua per una riga rateale', () => {
    const risultato = calcolaRataAnnua(
      [{ importoDovuto: 100000, percentualeOfferta: 60, modalita: 'RATEALE', numeroRate: 60 }],
      0
    );
    expect(risultato.rataAnnuaCostante).toBeCloseTo(12000, 2);
    expect(risultato.onereAggiuntivoAnno1).toBe(0);
  });

  it('allunga le rate con la leva, riducendo la rata annua', () => {
    const risultato = calcolaRataAnnua(
      [{ importoDovuto: 100000, percentualeOfferta: 60, modalita: 'RATEALE', numeroRate: 60 }],
      60
    );
    expect(risultato.rataAnnuaCostante).toBeCloseTo(6000, 2);
  });

  it('mette una riga a unica soluzione per intero nel primo anno', () => {
    const risultato = calcolaRataAnnua(
      [
        {
          importoDovuto: 50000,
          percentualeOfferta: 100,
          modalita: 'UNICA_SOLUZIONE',
          numeroRate: null,
        },
      ],
      0
    );
    expect(risultato.onereAggiuntivoAnno1).toBe(50000);
    expect(risultato.rataAnnuaCostante).toBe(0);
  });
});

describe('calcolaSimulazione', () => {
  const puntiStoriciBase = [
    { ricaviVendite: 1000000, ebitda: 100000, ebit: 70000, ammortamenti: 30000 },
    { ricaviVendite: 1050000, ebitda: 105000, ebit: 73500, ammortamenti: 31500 },
    { ricaviVendite: 1102500, ebitda: 110250, ebit: 77175, ammortamenti: 33075 },
  ];
  const propostaBase = [
    { importoDovuto: 500000, percentualeOfferta: 50, modalita: 'RATEALE' as const, numeroRate: 60 },
  ];

  it('produce tre scenari con il neutrale pari alla crescita storica', () => {
    const risultato = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: propostaBase,
      leve: LEVE_VUOTE,
    });
    const neutrale = risultato.scenari.find((s) => s.nome === 'neutrale')!;
    expect(neutrale.tassoCrescitaRicavi).toBeCloseTo(risultato.crescitaStoricaAzienda!, 5);
  });

  it('lo scenario ottimistico ha sempre un tasso di crescita più alto del pessimistico', () => {
    const risultato = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: propostaBase,
      leve: LEVE_VUOTE,
    });
    const ottimistico = risultato.scenari.find((s) => s.nome === 'ottimistico')!;
    const pessimistico = risultato.scenari.find((s) => s.nome === 'pessimistico')!;
    expect(ottimistico.tassoCrescitaRicavi).toBeGreaterThan(pessimistico.tassoCrescitaRicavi);
  });

  it('un DSCR sotto 1 in un solo anno rende lo scenario non viabile', () => {
    const risultato = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: [
        { importoDovuto: 5000000, percentualeOfferta: 100, modalita: 'RATEALE', numeroRate: 12 },
      ],
      leve: LEVE_VUOTE,
    });
    expect(risultato.scenari.every((s) => !s.viabile)).toBe(true);
  });

  it('le leve di riduzione costi migliorano il flusso disponibile', () => {
    const senzaLeve = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: propostaBase,
      leve: LEVE_VUOTE,
    });
    const conLeve = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: propostaBase,
      leve: { riduzioneCostiPct: 10, riduzionePersonalePct: 0, mesiAllungamentoRate: 0 },
    });
    const flussoSenza = senzaLeve.scenari.find((s) => s.nome === 'neutrale')!.anni[0]
      .flussoDisponibile;
    const flussoCon = conLeve.scenari.find((s) => s.nome === 'neutrale')!.anni[0].flussoDisponibile;
    expect(flussoCon).toBeGreaterThan(flussoSenza);
  });

  it('usa uno scarto di default dichiarato se il settore non è disponibile', () => {
    const risultato = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: propostaBase,
      leve: LEVE_VUOTE,
    });
    expect(risultato.scartoUsatoDiDefault).toBe(true);
    expect(risultato.scarto).toBeNull();
  });

  it("limita l'ampiezza degli scenari a un tetto massimo quando lo scarto storico è estremo", () => {
    // Azienda con crollo storico drammatico (-40%/anno), settore stabile:
    // uno scarto misurato enorme non deve tradursi in scenari altrettanto estremi.
    const puntiInCrisi = [
      { ricaviVendite: 3000000, ebitda: 100000, ebit: 70000, ammortamenti: 30000 },
      { ricaviVendite: 1800000, ebitda: 50000, ebit: 30000, ammortamenti: 20000 },
      { ricaviVendite: 1080000, ebitda: 20000, ebit: 5000, ammortamenti: 15000 },
    ];
    const puntiSettoreStabile = [
      { periodo: '2023-01', valore: 100 },
      { periodo: '2023-06', valore: 100 },
      { periodo: '2024-01', valore: 102 },
      { periodo: '2024-06', valore: 102 },
    ];
    const risultato = calcolaSimulazione({
      puntiStoriciAzienda: puntiInCrisi,
      puntiIstatSettore: puntiSettoreStabile,
      righeProposta: propostaBase,
      leve: LEVE_VUOTE,
    });
    expect(risultato.ampiezzaLimitata).toBe(true);
    const ottimistico = risultato.scenari.find((s) => s.nome === 'ottimistico')!;
    const neutrale = risultato.scenari.find((s) => s.nome === 'neutrale')!;
    // L'ampiezza (differenza tra ottimistico e neutrale) non deve superare il tetto (15 punti = 0.15)
    expect(ottimistico.tassoCrescitaRicavi - neutrale.tassoCrescitaRicavi).toBeLessThanOrEqual(
      0.15 + 1e-9
    );
  });

  it('il risparmio da riduzione costi scala con i ricavi proiettati, non resta fisso al livello storico', () => {
    // Confronta l'effetto della STESSA leva (1% di riduzione costi) tra lo
    // scenario ottimistico e quello pessimistico: nello scenario
    // pessimistico i ricavi proiettati sono molto più bassi, quindi il
    // risparmio assoluto in euro deve essere proporzionalmente più basso —
    // non identico, come accadeva con il calcolo ancorato ai costi storici.
    const senzaLeve = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: propostaBase,
      leve: LEVE_VUOTE,
    });
    const conLeve = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: propostaBase,
      leve: { riduzioneCostiPct: 1, riduzionePersonalePct: 0, mesiAllungamentoRate: 0 },
    });

    const flussoOttimisticoSenza = senzaLeve.scenari.find((s) => s.nome === 'ottimistico')!.anni[0]
      .flussoDisponibile;
    const flussoOttimisticoCon = conLeve.scenari.find((s) => s.nome === 'ottimistico')!.anni[0]
      .flussoDisponibile;
    const flussoPessimisticoSenza = senzaLeve.scenari.find((s) => s.nome === 'pessimistico')!
      .anni[0].flussoDisponibile;
    const flussoPessimisticoCon = conLeve.scenari.find((s) => s.nome === 'pessimistico')!.anni[0]
      .flussoDisponibile;

    const deltaOttimistico = flussoOttimisticoCon - flussoOttimisticoSenza;
    const deltaPessimistico = flussoPessimisticoCon - flussoPessimisticoSenza;

    // Il risparmio in euro deve essere diverso tra i due scenari (scala con
    // i ricavi proiettati, diversi in ciascuno) — con il bug, i due delta
    // erano identici perché ancorati allo stesso valore storico fisso.
    expect(deltaOttimistico).not.toBeCloseTo(deltaPessimistico, 0);
    // Un risparmio dell'1% sui costi non deve produrre un salto di decine
    // di migliaia di euro se i ricavi proiettati sono nell'ordine del
    // milione: qui ci si aspetta un delta ragionevole, non sproporzionato.
    expect(deltaOttimistico).toBeLessThan(flussoOttimisticoSenza);
  });

  it('usa la crescita ricavi manuale al posto di quella storica quando compilata', () => {
    const risultato = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: propostaBase,
      leve: { ...LEVE_VUOTE, crescitaRicaviManuale: 0 },
    });
    expect(risultato.crescitaManualeUsata).toBe(true);
    const neutrale = risultato.scenari.find((s) => s.nome === 'neutrale')!;
    expect(neutrale.tassoCrescitaRicavi).toBe(0);
  });

  it('senza crescita manuale usa il trend storico come prima', () => {
    const risultato = calcolaSimulazione({
      puntiStoriciAzienda: puntiStoriciBase,
      puntiIstatSettore: null,
      righeProposta: propostaBase,
      leve: LEVE_VUOTE,
    });
    expect(risultato.crescitaManualeUsata).toBe(false);
  });
});
