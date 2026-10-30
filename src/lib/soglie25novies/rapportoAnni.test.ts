import { describe, expect, it } from 'vitest';
import {
  anniDellaVerifica,
  contributiPerAnnoDaDb,
  rapportiPerAnno,
  serieDaPosizioni,
  serieDaValoriConservati,
  unisciContributiPerAnno,
} from './rapportoAnni';

describe('unisciContributiPerAnno', () => {
  it('tiene insieme i due lati e ordina gli anni', () => {
    expect(unisciContributiPerAnno({ 2025: 48_380, 2024: 55_760 }, { 2025: 44_471 })).toEqual([
      { anno: 2024, dovuti: 55_760, scaduti: null, oltre90: null },
      { anno: 2025, dovuti: 48_380, scaduti: 44_471, oltre90: null },
    ]);
  });

  it('un anno presente in un solo file resta, con l’altro lato a null', () => {
    expect(unisciContributiPerAnno({}, { 2022: 12_000 })).toEqual([
      { anno: 2022, dovuti: null, scaduti: 12_000, oltre90: null },
    ]);
  });

  it('senza dati non inventa anni', () => {
    expect(unisciContributiPerAnno({}, {})).toEqual([]);
  });

  it('porta con sé la parte scaduta da oltre 90 giorni', () => {
    expect(unisciContributiPerAnno({ 2025: 48_380 }, { 2025: 44_471 }, { 2025: 41_000 })).toEqual([
      { anno: 2025, dovuti: 48_380, scaduti: 44_471, oltre90: 41_000 },
    ]);
  });

  it('un anno con il solo ritardo misurato entra lo stesso', () => {
    expect(unisciContributiPerAnno({}, { 2024: 9_000 }, { 2024: 4_000 })[0]).toEqual({
      anno: 2024,
      dovuti: null,
      scaduti: 9_000,
      oltre90: 4_000,
    });
  });
});

describe('rapportiPerAnno', () => {
  it('calcola la quota e dice se supera il 30%', () => {
    const [r] = rapportiPerAnno([{ anno: 2025, dovuti: 48_380, scaduti: 44_471 }]);
    expect(r.quota).toBeCloseTo(0.9192, 3);
    expect(r.oltreQuota).toBe(true);
  });

  it('sotto la quota non segnala', () => {
    const [r] = rapportiPerAnno([{ anno: 2023, dovuti: 50_840, scaduti: 15_200 }]);
    expect(r.oltreQuota).toBe(false);
  });

  it('una quota esattamente al 30% non è oltre la quota', () => {
    const [r] = rapportiPerAnno([{ anno: 2024, dovuti: 10_000, scaduti: 3_000 }]);
    expect(r.quota).toBe(0.3);
    expect(r.oltreQuota).toBe(false);
  });

  it('senza dovuto o senza scaduto il rapporto non si calcola', () => {
    const r = rapportiPerAnno([
      { anno: 2022, dovuti: 385_200, scaduti: null },
      { anno: 2023, dovuti: null, scaduti: 9_000 },
    ]);
    expect(r.map((x) => x.quota)).toEqual([null, null]);
    expect(r.map((x) => x.oltreQuota)).toEqual([null, null]);
  });

  it('con dovuti a zero non divide per zero', () => {
    const [r] = rapportiPerAnno([{ anno: 2024, dovuti: 0, scaduti: 5_000 }]);
    expect(r.quota).toBeNull();
    expect(r.oltreQuota).toBeNull();
  });

  it('ordina gli anni anche se arrivano disordinati', () => {
    const r = rapportiPerAnno([
      { anno: 2025, dovuti: 10, scaduti: 1 },
      { anno: 2023, dovuti: 10, scaduti: 2 },
    ]);
    expect(r.map((x) => x.anno)).toEqual([2023, 2025]);
  });

  it('dice per ogni anno se il ritardo di oltre 90 giorni è integrato', () => {
    const r = rapportiPerAnno([
      { anno: 2023, dovuti: 50_840, scaduti: 15_200, oltre90: 0 },
      { anno: 2025, dovuti: 48_380, scaduti: 44_471, oltre90: 41_000 },
    ]);
    expect(r.map((x) => x.ritardoOltre90)).toEqual([false, true]);
  });

  it('un ritardo non misurato resta null, non falso', () => {
    const [r] = rapportiPerAnno([{ anno: 2025, dovuti: 48_380, scaduti: 44_471 }]);
    expect(r.ritardoOltre90).toBeNull();
    // La quota si calcola lo stesso: sono due requisiti distinti.
    expect(r.oltreQuota).toBe(true);
  });
});

describe('anniDellaVerifica', () => {
  it('ricava i tre anni del triage da un giorno civile', () => {
    expect(anniDellaVerifica('2026-09-11')).toEqual({
      corrente: 2026,
      precedente: 2025,
      meno2: 2024,
    });
  });

  it('senza una data leggibile non attribuisce anni', () => {
    expect(anniDellaVerifica(null)).toBeNull();
    expect(anniDellaVerifica('')).toBeNull();
    expect(anniDellaVerifica('non-una-data')).toBeNull();
  });
});

describe('serieDaPosizioni', () => {
  const anni = { corrente: 2026, precedente: 2025, meno2: 2024 };

  it('prende scaduti per esercizio e dovuto dell’anno precedente', () => {
    expect(
      serieDaPosizioni(
        [
          {
            categoria: 'PREVIDENZIALE',
            importoAnnoCorrente: 44_471,
            importoAnnoPrecedente: 18_400,
            importoAnnoMeno2: 15_200,
            riferimentoAnnoPrecedente: 48_380,
          },
        ],
        anni
      )
    ).toEqual([
      { anno: 2024, dovuti: null, scaduti: 15_200, oltre90: null },
      { anno: 2025, dovuti: 48_380, scaduti: 18_400, oltre90: null },
      { anno: 2026, dovuti: null, scaduti: 44_471, oltre90: null },
    ]);
  });

  it('somma le righe previdenziali e ignora le altre categorie', () => {
    const serie = serieDaPosizioni(
      [
        {
          categoria: 'PREVIDENZIALE',
          importoAnnoCorrente: 1_000,
          importoAnnoPrecedente: null,
          importoAnnoMeno2: null,
          riferimentoAnnoPrecedente: 10_000,
        },
        {
          categoria: 'PREVIDENZIALE',
          importoAnnoCorrente: 2_000,
          importoAnnoPrecedente: null,
          importoAnnoMeno2: null,
          riferimentoAnnoPrecedente: 5_000,
        },
        {
          categoria: 'IVA',
          importoAnnoCorrente: 90_000,
          importoAnnoPrecedente: 80_000,
          importoAnnoMeno2: null,
          riferimentoAnnoPrecedente: 900_000,
        },
      ],
      anni
    );
    expect(serie).toEqual([
      { anno: 2025, dovuti: 15_000, scaduti: null, oltre90: null },
      { anno: 2026, dovuti: null, scaduti: 3_000, oltre90: null },
    ]);
  });

  it('senza posizioni previdenziali non inventa una serie', () => {
    expect(serieDaPosizioni([], anni)).toEqual([]);
  });
});

describe('serieDaValoriConservati', () => {
  it('attribuisce il dovuto al suo anno e lo scaduto all’anno della verifica', () => {
    expect(
      serieDaValoriConservati({
        annoDovuti: 2025,
        dovuti: 48_380,
        annoScaduti: 2026,
        scaduti: 44_471,
      })
    ).toEqual([
      { anno: 2025, dovuti: 48_380, scaduti: null, oltre90: null },
      { anno: 2026, dovuti: null, scaduti: 44_471, oltre90: null },
    ]);
  });

  it('porta solo il lato che c’è', () => {
    expect(
      serieDaValoriConservati({
        annoDovuti: 2025,
        dovuti: 48_380,
        annoScaduti: null,
        scaduti: null,
      })
    ).toEqual([{ anno: 2025, dovuti: 48_380, scaduti: null, oltre90: null }]);
  });

  it('senza valori non inventa un anno', () => {
    expect(
      serieDaValoriConservati({ annoDovuti: null, dovuti: 0, annoScaduti: null, scaduti: 0 })
    ).toEqual([]);
  });
});

describe('contributiPerAnnoDaDb', () => {
  it('legge il JSON già decodificato dal driver', () => {
    expect(contributiPerAnnoDaDb([{ anno: 2025, dovuti: 48_380, scaduti: 44_471 }])).toEqual([
      { anno: 2025, dovuti: 48_380, scaduti: 44_471, oltre90: null },
    ]);
  });

  it('legge anche la stringa JSON', () => {
    expect(contributiPerAnnoDaDb('[{"anno":2024,"dovuti":55760,"scaduti":18400}]')).toEqual([
      { anno: 2024, dovuti: 55_760, scaduti: 18_400, oltre90: null },
    ]);
  });

  it('legge il ritardo oltre 90 giorni salvato', () => {
    expect(
      contributiPerAnnoDaDb('[{"anno":2025,"dovuti":48380,"scaduti":44471,"oltre90":41000}]')
    ).toEqual([{ anno: 2025, dovuti: 48_380, scaduti: 44_471, oltre90: 41_000 }]);
  });

  it('un valore illeggibile non blocca la scheda: serie vuota', () => {
    expect(contributiPerAnnoDaDb('non-json')).toEqual([]);
    expect(contributiPerAnnoDaDb(null)).toEqual([]);
    expect(contributiPerAnnoDaDb({})).toEqual([]);
  });

  it('scarta le righe senza un anno plausibile', () => {
    expect(contributiPerAnnoDaDb([{ anno: 0 }, { anno: 'x' }, { anno: 2025, dovuti: 10 }])).toEqual(
      [{ anno: 2025, dovuti: 10, scaduti: null, oltre90: null }]
    );
  });
});
