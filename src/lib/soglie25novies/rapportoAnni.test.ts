import { describe, expect, it } from 'vitest';
import { contributiPerAnnoDaDb, rapportiPerAnno, unisciContributiPerAnno } from './rapportoAnni';

describe('unisciContributiPerAnno', () => {
  it('tiene insieme i due lati e ordina gli anni', () => {
    expect(unisciContributiPerAnno({ 2025: 48_380, 2024: 55_760 }, { 2025: 44_471 })).toEqual([
      { anno: 2024, dovuti: 55_760, scaduti: null },
      { anno: 2025, dovuti: 48_380, scaduti: 44_471 },
    ]);
  });

  it('un anno presente in un solo file resta, con l’altro lato a null', () => {
    expect(unisciContributiPerAnno({}, { 2022: 12_000 })).toEqual([
      { anno: 2022, dovuti: null, scaduti: 12_000 },
    ]);
  });

  it('senza dati non inventa anni', () => {
    expect(unisciContributiPerAnno({}, {})).toEqual([]);
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
});

describe('contributiPerAnnoDaDb', () => {
  it('legge il JSON già decodificato dal driver', () => {
    expect(contributiPerAnnoDaDb([{ anno: 2025, dovuti: 48_380, scaduti: 44_471 }])).toEqual([
      { anno: 2025, dovuti: 48_380, scaduti: 44_471 },
    ]);
  });

  it('legge anche la stringa JSON', () => {
    expect(contributiPerAnnoDaDb('[{"anno":2024,"dovuti":55760,"scaduti":18400}]')).toEqual([
      { anno: 2024, dovuti: 55_760, scaduti: 18_400 },
    ]);
  });

  it('un valore illeggibile non blocca la scheda: serie vuota', () => {
    expect(contributiPerAnnoDaDb('non-json')).toEqual([]);
    expect(contributiPerAnnoDaDb(null)).toEqual([]);
    expect(contributiPerAnnoDaDb({})).toEqual([]);
  });

  it('scarta le righe senza un anno plausibile', () => {
    expect(contributiPerAnnoDaDb([{ anno: 0 }, { anno: 'x' }, { anno: 2025, dovuti: 10 }])).toEqual(
      [{ anno: 2025, dovuti: 10, scaduti: null }]
    );
  });
});
