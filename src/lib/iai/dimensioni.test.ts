import { describe, it, expect } from 'vitest';
import { diagnosticaDimensioni, normalizza, altmanZ2, type DatiIai } from './dimensioni';

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

const perCodice = (d: DatiIai, codice: string) =>
  diagnosticaDimensioni(d).find((c) => c.dimensione === codice)!;

describe('dimensioni della lettura', () => {
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

  it('DEO GRIFO: procedura pendente e denunce assenti fra i determinanti, nessun totale', () => {
    const dimensioni = diagnosticaDimensioni(DEO);
    expect(dimensioni).toHaveLength(5);
    expect(perCodice(DEO, 'E').punteggio).toBe(100);
    expect(perCodice(DEO, 'A').motivi.join(' ')).toContain('nessuna denuncia Uniemens');
    expect(perCodice(DEO, 'D').motivi.some((m) => m.includes('non disaggregati'))).toBe(true);
    // Nessun esito complessivo: le dimensioni non hanno né indice né fascia.
    expect(Object.keys(dimensioni[0]).sort()).toEqual([
      'dimensione',
      'lacune',
      'motivi',
      'punteggio',
    ]);
  });

  it('è deterministico e una posizione tranquilla resta a intensità bassa', () => {
    expect(diagnosticaDimensioni(DEO)).toEqual(diagnosticaDimensioni(DEO));
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
    for (const c of diagnosticaDimensioni(sana)) expect(c.punteggio).toBeLessThanOrEqual(30);
  });
});
