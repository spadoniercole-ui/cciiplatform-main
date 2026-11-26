import { describe, expect, it } from 'vitest';
import {
  congelaParametri,
  dataItaliana,
  giornoIso,
  ordinamentoVersioni,
  parametriCongelati,
  propostaDecorrenza,
  ranghiSenzaValori,
  riepilogoVersione,
  statoVersione,
  versioneInVigore,
  type VersioneParametri,
} from './versioniParametri';
import { RANGHI, type ParametriScenari } from './scenari';

function parametri(
  costi: number | null,
  valori: Partial<Record<string, [number | null, number | null]>> = {}
): ParametriScenari {
  return {
    costiProceduraPct: costi,
    ranghi: RANGHI.map((r) => ({
      rango: r.codice,
      tassoLiquidazionePct: valori[r.codice]?.[0] ?? null,
      cramDownPct: valori[r.codice]?.[1] ?? null,
    })),
  };
}

function versione(
  id: number,
  validiDa: string,
  costi = 20,
  nota: string | null = null
): VersioneParametri {
  return {
    id,
    validiDa,
    nota,
    parametri: parametri(costi, { PREDEDUCIBILE: [100, 100] }),
    creataIl: '2026-01-01',
  };
}

describe('date delle versioni', () => {
  it('accetta solo giorni veri, non date interpretate a metà', () => {
    expect(giornoIso('2026-02-28')).toBe('2026-02-28');
    expect(giornoIso('2026-02-30')).toBeNull();
    expect(giornoIso('28/02/2026')).toBeNull();
    expect(giornoIso('')).toBeNull();
    expect(giornoIso(null)).toBeNull();
  });

  it('legge le date come si leggono in Italia', () => {
    expect(dataItaliana('2026-03-01')).toBe('01/03/2026');
    expect(dataItaliana(null)).toBe('—');
  });
});

describe('versione in vigore', () => {
  const versioni = [
    versione(3, '2026-06-01', 30),
    versione(2, '2026-01-01'),
    versione(1, '2025-01-01'),
  ];

  it('prende l’ultima con decorrenza fino al giorno di riferimento', () => {
    expect(versioneInVigore(versioni, '2026-07-15')?.id).toBe(3);
    expect(versioneInVigore(versioni, '2026-06-01')?.id).toBe(3);
    expect(versioneInVigore(versioni, '2026-05-31')?.id).toBe(2);
  });

  it('una decorrenza nel futuro non vale ancora', () => {
    expect(versioneInVigore([versione(4, '2027-01-01')], '2026-11-25')).toBeNull();
  });

  it('senza data o senza versioni non si inventa nulla', () => {
    expect(versioneInVigore(versioni, null)).toBeNull();
    expect(versioneInVigore([], '2026-11-25')).toBeNull();
  });

  it('a parità di decorrenza vince la più recente registrata', () => {
    const stessaData = [versione(5, '2026-01-01', 10), versione(7, '2026-01-01', 40)];
    expect(versioneInVigore(stessaData, '2026-11-25')?.id).toBe(7);
  });

  it('dice se una versione è in vigore, programmata o superata', () => {
    const tutte = [versione(1, '2025-01-01'), versione(2, '2026-01-01'), versione(3, '2027-01-01')];
    expect(statoVersione(tutte[1], tutte, '2026-11-25')).toBe('IN_VIGORE');
    expect(statoVersione(tutte[2], tutte, '2026-11-25')).toBe('PROGRAMMATA');
    expect(statoVersione(tutte[0], tutte, '2026-11-25')).toBe('SUPERATA');
  });

  it('ordina dalla più recente', () => {
    const ordinate = [...versioni].sort(ordinamentoVersioni);
    expect(ordinate.map((v) => v.id)).toEqual([3, 2, 1]);
  });

  it('propone oggi, o il giorno dopo l’ultima decorrenza se oggi è occupato', () => {
    expect(propostaDecorrenza(versioni, '2026-09-01')).toBe('2026-09-01');
    expect(propostaDecorrenza(versioni, '2026-06-01')).toBe('2026-06-02');
    expect(propostaDecorrenza([], '2026-06-01')).toBe('2026-06-01');
  });
});

describe('congelamento sui documenti chiusi', () => {
  it('conserva i valori della versione, non un rimando', () => {
    const congelati = congelaParametri(versione(2, '2026-01-01', 20), '2026-11-25');
    expect(congelati).not.toBeNull();
    expect(congelati?.versioneId).toBe(2);
    expect(congelati?.validiDa).toBe('2026-01-01');
    expect(congelati?.congelatiIl).toBe('2026-11-25');
    expect(congelati?.parametri.costiProceduraPct).toBe(20);
  });

  it('senza versione non si congela nulla', () => {
    expect(congelaParametri(null, '2026-11-25')).toBeNull();
  });

  it('rilegge l’istantanea e la ricompone sui ranghi', () => {
    const congelati = congelaParametri(versione(2, '2026-01-01', 20), '2026-11-25');
    const riletta = parametriCongelati(JSON.parse(JSON.stringify(congelati)));
    expect(riletta?.parametri.costiProceduraPct).toBe(20);
    expect(riletta?.parametri.ranghi.map((r) => r.rango)).toEqual(RANGHI.map((r) => r.codice));
    expect(riletta?.parametri.ranghi[0].tassoLiquidazionePct).toBe(100);
  });

  it('un’istantanea illeggibile vale «nessuna»: chi legge ripiega sui parametri correnti', () => {
    expect(parametriCongelati(null)).toBeNull();
    expect(parametriCongelati('20%')).toBeNull();
    expect(parametriCongelati({ versioneId: 2 })).toBeNull();
  });

  it('un’istantanea parziale resta leggibile, con i buchi dichiarati', () => {
    const riletta = parametriCongelati({
      versioneId: 4,
      validiDa: '2026-02-01',
      parametri: { costiProceduraPct: 12, ranghi: [{ rango: 'PRIVILEGIATO', cramDownPct: 40 }] },
    });
    expect(riletta?.parametri.costiProceduraPct).toBe(12);
    const privilegiato = riletta?.parametri.ranghi.find((r) => r.rango === 'PRIVILEGIATO');
    expect(privilegiato).toEqual({
      rango: 'PRIVILEGIATO',
      tassoLiquidazionePct: null,
      cramDownPct: 40,
    });
  });
});

describe('lettura della scheda', () => {
  it('riassume i valori in una riga', () => {
    const testo = riepilogoVersione(versione(1, '2026-01-01', 20));
    expect(testo).toContain('spese 20%');
    expect(testo).toContain('prededucibile 100% / 100%');
  });

  it('dice quali ranghi non hanno nessun valore', () => {
    const senza = ranghiSenzaValori(versione(1, '2026-01-01', 20));
    expect(senza).toEqual(['PRIVILEGIATO', 'CHIROGRAFARIO', 'POSTERGATO']);
  });
});
