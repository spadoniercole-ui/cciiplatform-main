import { describe, it, expect } from 'vitest';
import { calcolaPianoConLeve, pianoConLeve } from './levePiano';
import { LEVE_PREDEFINITE, type LeveSimulazione } from './leveSimulazione';
import { calcolaPiano, type EsercizioStorico } from './piano';

const S: EsercizioStorico = {
  anno: 2025,
  ricaviVendite: 1_000_000,
  valoreProduzione: 1_000_000,
  costiProduzione: 900_000,
  ammortamenti: 50_000,
  costiPersonale: 400_000,
  oneriFinanziari: 10_000,
  utileEsercizio: 50_000,
  immobilizzazioni: 300_000,
  creditiClienti: 200_000,
  disponibilitaLiquide: 20_000,
  attivoCircolante: 300_000,
  totaleAttivo: 600_000,
  patrimonioNetto: 100_000,
  debitiBanche: 100_000,
  debitiFornitori: 150_000,
  debitiTributari: 20_000,
  debitiPrevidenziali: 30_000,
  totaleDebiti: 300_000,
};

const leve = (patch: Partial<LeveSimulazione>): LeveSimulazione => ({
  ...LEVE_PREDEFINITE,
  ...patch,
});

describe('le leve diventano numeri del piano', () => {
  it('senza leve accese le ipotesi restano quelle scritte', () => {
    const ipotesi = { ricaviVendite: [{ tipo: 'pct' as const, valore: 3 }] };
    const e = pianoConLeve({ storico: S, orizzonte: 3, ipotesi, leve: LEVE_PREDEFINITE });
    expect(e.ipotesi).toBe(ipotesi);
    expect(e.effetti).toHaveLength(0);
    expect(e.sacrifici).toHaveLength(0);
  });

  it('tagli del personale: il costo scende, il risparmio arriva all’EBITDA e la riga del personale lo mostra', () => {
    const e = pianoConLeve({
      storico: S,
      orizzonte: 3,
      ipotesi: {},
      leve: leve({ PERSONALE: { attiva: true, misura: 10 } }),
    });
    expect(e.ipotesi.costiPersonale?.[0]).toMatchObject({ tipo: 'abs', valore: 360_000 });
    expect(e.ipotesi.costiOperativi?.[0]).toMatchObject({ tipo: 'abs', valore: 810_000 });
    const piano = calcolaPiano(S, 3, e.ipotesi, { ente: [0, 0, 0], altri: [0, 0, 0] });
    // EBITDA di partenza 150.000 (valore produzione 1.000.000 − costi operativi
    // 850.000, senza ammortamenti), più 40.000 di risparmio.
    expect(piano.anni[0].ebitda).toBe(190_000);
    expect(piano.anni[0].costiPersonale).toBe(360_000);
    expect(e.effetti[0].testo).toContain('40.000');
    expect(e.sacrifici[0]).toMatch(/capacità produttiva/);
  });

  it('diversificazione: ricavi nuovi a regime entro la rampa, con i costi dell’incidenza storica', () => {
    const e = pianoConLeve({
      storico: S,
      orizzonte: 3,
      ipotesi: {},
      leve: leve({ PRODUZIONE: { attiva: true, misura: 20 } }),
    });
    // 20% di 1.000.000, a regime dal terzo anno.
    expect(e.ipotesi.ricaviVendite?.map((x) => x?.valore)).toEqual([
      1_066_666.67, 1_133_333.33, 1_200_000,
    ]);
    // Costi aggiunti: 85% dei ricavi nuovi (incidenza storica dei costi operativi).
    expect(e.ipotesi.costiOperativi?.map((x) => x?.valore)).toEqual([
      906_666.67, 963_333.33, 1_020_000,
    ]);
    const piano = calcolaPiano(S, 3, e.ipotesi, { ente: [0, 0, 0], altri: [0, 0, 0] });
    // L'EBITDA migliora per il margine sui ricavi nuovi (15% di 200.000 = 30.000).
    expect(piano.anni[2].ebitda).toBe(180_000);
  });

  it('tecnologia: investimento in percentuale dei ricavi e ammortamenti a quote costanti', () => {
    const e = pianoConLeve({
      storico: S,
      orizzonte: 3,
      ipotesi: {},
      leve: leve({ TECNOLOGIA: { attiva: true, misura: 10 } }),
    });
    expect(e.ipotesi.investimenti?.map((x) => x?.valore)).toEqual([100_000, 100_000, 100_000]);
    // 100.000 in 5 anni = 20.000 l'anno: 20.000, 40.000, 60.000.
    expect(e.ipotesi.ammortamenti?.map((x) => x?.valore)).toEqual([70_000, 90_000, 110_000]);
    expect(e.effetti[0].testo).toContain('100.000');
  });

  it('le leve si sommano alle ipotesi dell’analisi, non le sostituiscono', () => {
    const e = pianoConLeve({
      storico: S,
      orizzonte: 2,
      ipotesi: {
        ricaviVendite: [
          { tipo: 'pct', valore: 10, motivazione: 'Settore in ripresa.' },
          { tipo: 'pct', valore: 10 },
        ],
      },
      leve: leve({ MERCATI: { attiva: true, misura: 10 } }),
    });
    // Percorso: 1.100.000, poi 1.210.000; più 10% della partenza (100.000) a regime dal secondo anno.
    expect(e.ipotesi.ricaviVendite?.map((x) => x?.valore)).toEqual([1_150_000, 1_310_000]);
    expect(e.ipotesi.ricaviVendite?.[0]?.motivazione).toContain('Settore in ripresa.');
    expect(e.ipotesi.ricaviVendite?.[0]?.motivazione).toContain('Diversificazione dei mercati');
  });

  it('il piano con le leve passa da un solo punto: ipotesi scritte, leve una volta', () => {
    const rate = { ente: [0, 0, 0], altri: [0, 0, 0] };
    const e = calcolaPianoConLeve({
      storico: S,
      orizzonte: 3,
      ipotesi: {},
      leve: leve({ PERSONALE: { attiva: true, misura: 10 } }),
      rate,
    });
    expect(e.esito).toEqual(calcolaPiano(S, 3, e.applicazione.ipotesi, rate));
    expect(e.applicazione.ipotesi.costiPersonale?.[0]).toMatchObject({
      tipo: 'abs',
      valore: 360_000,
    });
    expect(e.applicazione.effetti[0].testo).toContain('40.000');
  });

  it('senza leve accese il piano è quello delle ipotesi scritte, senza riscritture', () => {
    const rate = { ente: [0, 0, 0], altri: [0, 0, 0] };
    const ipotesi = { ricaviVendite: [{ tipo: 'pct' as const, valore: 3 }] };
    const e = calcolaPianoConLeve({
      storico: S,
      orizzonte: 3,
      ipotesi,
      leve: LEVE_PREDEFINITE,
      rate,
    });
    expect(e.esito).toEqual(calcolaPiano(S, 3, ipotesi, rate));
    expect(e.applicazione.ipotesi).toBe(ipotesi);
  });

  it('personale non separato nel bilancio: la leva non inventa numeri e lo dichiara', () => {
    const senzaPersonale: EsercizioStorico = { ...S, costiPersonale: null };
    const e = pianoConLeve({
      storico: senzaPersonale,
      orizzonte: 2,
      ipotesi: {},
      leve: leve({ PERSONALE: { attiva: true, misura: 10 } }),
    });
    expect(e.ipotesi).toEqual({});
    expect(e.avvisi[0]).toMatch(/non separa il costo del personale/);
  });

  it('il personale segue il percorso dei costi, non il solo storico', () => {
    const e = pianoConLeve({
      storico: S,
      orizzonte: 2,
      ipotesi: {
        costiOperativi: [
          { tipo: 'abs', valore: 765_000 },
          { tipo: 'abs', valore: 765_000 },
        ],
      },
      leve: leve({ PERSONALE: { attiva: true, misura: 10 } }),
    });
    // Costi 850.000 − 10% = 765.000; personale al 47,06% = 360.000; taglio 10% = 324.000.
    expect(e.ipotesi.costiOperativi?.map((x) => x?.valore)).toEqual([729_000, 729_000]);
    expect(e.ipotesi.costiPersonale?.map((x) => x?.valore)).toEqual([324_000, 324_000]);
  });

  it('personale e ricavi nuovi: la riga del personale comprende il personale dei costi aggiunti', () => {
    const e = pianoConLeve({
      storico: S,
      orizzonte: 3,
      ipotesi: {},
      leve: leve({
        PERSONALE: { attiva: true, misura: 10 },
        PRODUZIONE: { attiva: true, misura: 20 },
      }),
    });
    // Ricavi nuovi: 200.000 a regime; costi aggiunti al 85% = 170.000.
    // Personale al 47,06% anche sui costi aggiunti: 480.000 nel terzo anno,
    // tagliato del 10% = 432.000; costi totali 1.020.000 − 48.000 = 972.000.
    expect(e.ipotesi.costiPersonale?.map((x) => x?.valore)).toEqual([384_000, 408_000, 432_000]);
    expect(e.ipotesi.costiOperativi?.map((x) => x?.valore)).toEqual([864_000, 918_000, 972_000]);
    const piano = calcolaPiano(S, 3, e.ipotesi, { ente: [0, 0, 0], altri: [0, 0, 0] });
    expect(piano.anni[2].costiPersonale).toBe(432_000);
    expect(piano.anni[2].costiOperativi - (piano.anni[2].costiPersonale ?? 0)).toBe(540_000);
    expect(piano.anni[2].ebitda).toBe(228_000);
  });

  it('i ricavi nuovi usano l’incidenza storica, non quella del primo anno', () => {
    const e = pianoConLeve({
      storico: S,
      orizzonte: 3,
      ipotesi: {
        costiOperativi: [
          { tipo: 'abs', valore: 765_000 },
          { tipo: 'abs', valore: 765_000 },
          { tipo: 'abs', valore: 765_000 },
        ],
        creditiClienti: [
          { tipo: 'abs', valore: 180_000 },
          { tipo: 'abs', valore: 180_000 },
          { tipo: 'abs', valore: 180_000 },
        ],
      },
      leve: leve({ PRODUZIONE: { attiva: true, misura: 20 } }),
    });
    // 20% di 1.000.000 = 200.000 a regime; costi al 85% storico, crediti al 20%.
    expect(e.ipotesi.costiOperativi?.map((x) => x?.valore)).toEqual([
      821_666.67, 878_333.33, 935_000,
    ]);
    expect(e.ipotesi.creditiClienti?.map((x) => x?.valore)).toEqual([
      193_333.33, 206_666.67, 220_000,
    ]);
  });

  it('le righe non toccate restano le ipotesi scritte', () => {
    const ipotesi = {
      ricaviVendite: [{ tipo: 'pct' as const, valore: 3 }],
      investimenti: [{ tipo: 'abs' as const, valore: 50_000 }],
    };
    const e = pianoConLeve({
      storico: S,
      orizzonte: 2,
      ipotesi,
      leve: leve({ PERSONALE: { attiva: true, misura: 10 } }),
    });
    expect(e.ipotesi.ricaviVendite).toBe(ipotesi.ricaviVendite);
    expect(e.ipotesi.investimenti).toBe(ipotesi.investimenti);
  });
});
