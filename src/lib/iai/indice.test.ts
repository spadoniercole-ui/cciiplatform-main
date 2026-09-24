import { describe, it, expect } from 'vitest';
import { calcolaIai, normalizza, altmanZ2, type DatiIai } from './indice';

const DEO: DatiIai = {
  ente: {
    soglie: [
      {
        ambito: 'Segnalazione INPS — imprese con lavoratori',
        esito: 'non_determinabile',
        esposizione: 19_621,
      },
    ],
    importiNonNoti: 4,
    denunceAssenti: true,
    addetti: 7,
  },
  bilancio: {
    corrente: {
      anno: 2025,
      ricavi: 1_016_000,
      ebitda: -6_683,
      utile: -5_956,
      totaleAttivo: 1_680_673,
      attivoCircolante: 1_549_158,
      patrimonioNetto: -504_146,
      totaleDebiti: 2_029_450,
      debitiNonDisaggregati: true,
    },
    precedente: { ricavi: 1_425_326, utile: 34_677, patrimonioNetto: -498_191 },
  },
  fascicolo: { totale: 111, titoloEnte: 16, dichiarato: 90, nonNoti: 4 },
  visura: {
    disponibile: true,
    proceduraPendente: 'concordato preventivo del 05/02/2021 (Siracusa)',
    statoAttivitaAnomalo: null,
    giorniVisura: 2,
    capitaleSociale: 3_000,
  },
};

describe('IAI', () => {
  it('normalizza per distanza dall’obiettivo, con saturazione', () => {
    expect(normalizza(0, 0, 100)).toBe(0);
    expect(normalizza(150, 0, 100)).toBe(100);
    expect(normalizza(50, 0, 100)).toBe(50);
    expect(normalizza(-1.5, -2.6, -1.1)).toBe(73);
  });
  it('lo Z’’-score torna null senza attivo o debiti', () => {
    expect(
      altmanZ2({
        attivoCircolante: 1,
        passivoCorrente: null,
        totaleAttivo: 0,
        utiliNonDistribuiti: null,
        ebit: 0,
        patrimonioNetto: 0,
        totaleDebiti: 1,
      })
    ).toBeNull();
  });
  it('DEO GRIFO: fascia urgente, con vincoli, e tre righe di sintesi', () => {
    const e = calcolaIai(DEO);
    expect(e.indice).toBeGreaterThanOrEqual(76);
    expect(e.fascia.nome).toBe('Da sottoporre con urgenza');
    expect(e.vincoliScattati.map((v) => v.nome)).toEqual(
      expect.arrayContaining([
        'Procedura concorsuale pendente in visura',
        'Denunce Uniemens assenti con addetti dichiarati',
      ])
    );
    expect(e.componenti.find((c) => c.dimensione === 'E')!.punteggio).toBe(100);
    expect(
      e.componenti
        .find((c) => c.dimensione === 'D')!
        .motivi.some((m) => m.includes('non disaggregati'))
    ).toBe(true);
    expect(e.sintesi.split('\n')).toHaveLength(3);
    expect(e.sintesi).not.toMatch(/\b(crisi|insolvenza|solid)/i);
  });
  it('è deterministico e una posizione tranquilla resta in fascia bassa', () => {
    expect(calcolaIai(DEO)).toEqual(calcolaIai(DEO));
    const sana: DatiIai = {
      ente: {
        soglie: [{ ambito: 'INPS', esito: 'sotto', esposizione: 0 }],
        importiNonNoti: 0,
        denunceAssenti: false,
        addetti: 5,
      },
      bilancio: {
        corrente: {
          anno: 2025,
          ricavi: 2_000_000,
          ebitda: 200_000,
          utile: 80_000,
          totaleAttivo: 1_500_000,
          attivoCircolante: 900_000,
          patrimonioNetto: 600_000,
          totaleDebiti: 800_000,
          debitiNonDisaggregati: false,
        },
        precedente: { ricavi: 1_900_000, utile: 60_000, patrimonioNetto: 520_000 },
      },
      fascicolo: { totale: 20, titoloEnte: 12, dichiarato: 8, nonNoti: 0 },
      visura: {
        disponibile: true,
        proceduraPendente: null,
        statoAttivitaAnomalo: null,
        giorniVisura: 10,
        capitaleSociale: 10_000,
      },
    };
    const e = calcolaIai(sana);
    expect(e.indice).toBeLessThanOrEqual(30);
    expect(e.vincoliScattati).toEqual([]);
  });
  it('un vincolo impedisce la compensazione: bilancio ottimo ma procedura pendente', () => {
    const e = calcolaIai({
      ...DEO,
      ente: { soglie: [], importiNonNoti: 0, denunceAssenti: false, addetti: 7 },
      bilancio: {
        corrente: {
          ...DEO.bilancio.corrente!,
          ebitda: 300_000,
          utile: 200_000,
          patrimonioNetto: 900_000,
          totaleDebiti: 500_000,
          debitiNonDisaggregati: false,
        },
        precedente: { ricavi: 900_000, utile: 100_000, patrimonioNetto: 700_000 },
      },
      fascicolo: { totale: 10, titoloEnte: 8, dichiarato: 2, nonNoti: 0 },
    });
    expect(e.indice).toBeGreaterThanOrEqual(70);
  });
});

describe('parametri dell’ente', () => {
  it('valida, riempie i mancanti con i predefiniti e non accetta pesi tutti a zero', async () => {
    const { parametriDaEnte, PARAMETRI_IAI_PREDEFINITI } = await import('./indice');
    const p = parametriDaEnte({
      pesi: { A: 50, B: 'x', C: 200 },
      vincoli: { proceduraPendente: 90 },
    });
    expect(p.pesi).toEqual({ A: 50, B: 25, C: 100, D: 15, E: 15 });
    expect(p.vincoli.proceduraPendente).toBe(90);
    expect(p.vincoli.sogliaEnteSuperata).toBe(PARAMETRI_IAI_PREDEFINITI.vincoli.sogliaEnteSuperata);
    expect(parametriDaEnte({ pesi: { A: 0, B: 0, C: 0, D: 0, E: 0 } }).pesi).toEqual(
      PARAMETRI_IAI_PREDEFINITI.pesi
    );
  });
});
