import { describe, it, expect } from 'vitest';
import { calcolaSoglie25Novies, SOGLIE_25NOVIES, type DatiSoglie } from './calcolo';

// I numeri vengono dal testo dell'art. 25-novies comma 1, non da stime.
// Se una riforma cambia una soglia, è qui che deve rompersi qualcosa.

const vuoto: DatiSoglie = {
  conLavoratori: null,
  contributiScaduti: null,
  contributiDovutiAnnoPrecedente: null,
  annoContributiDovuti: null,
  sanzioniPresunte: null,
  premiInail: null,
  ivaScaduta: null,
  volumeAffari: null,
  creditiAffidati: null,
  formaAER: null,
};

describe('soglie di legge', () => {
  it('sono quelle dell’articolo', () => {
    expect(SOGLIE_25NOVIES.inpsPercentuale).toBe(0.3);
    expect(SOGLIE_25NOVIES.inpsImportoConLavoratori).toBe(15_000);
    expect(SOGLIE_25NOVIES.inpsImportoSenzaLavoratori).toBe(5_000);
    expect(SOGLIE_25NOVIES.inail).toBe(5_000);
    expect(SOGLIE_25NOVIES.ivaImporto).toBe(5_000);
    expect(SOGLIE_25NOVIES.ivaPercentualeVolumeAffari).toBe(0.1);
    expect(SOGLIE_25NOVIES.ivaImportoAssoluto).toBe(20_000);
    expect(SOGLIE_25NOVIES.aerImpresaIndividuale).toBe(100_000);
    expect(SOGLIE_25NOVIES.aerSocietaPersone).toBe(200_000);
    expect(SOGLIE_25NOVIES.aerAltreSocieta).toBe(500_000);
    expect(SOGLIE_25NOVIES.giorniRitardo).toBe(90);
  });

  it('produce sette righe', () => {
    expect(calcolaSoglie25Novies(vuoto).righe).toHaveLength(7);
  });
});

describe('INPS — i due requisiti sono congiunti', () => {
  it('sopra il 30% ma sotto i 15.000 € → sotto soglia', () => {
    const e = calcolaSoglie25Novies({
      ...vuoto,
      conLavoratori: true,
      contributiScaduti: 12_000,
      contributiDovutiAnnoPrecedente: 20_000, // 30% = 6.000
    });
    expect(e.superate).toHaveLength(0);
  });

  it('sopra i 15.000 € ma sotto il 30% → sotto soglia', () => {
    const e = calcolaSoglie25Novies({
      ...vuoto,
      conLavoratori: true,
      contributiScaduti: 16_000,
      contributiDovutiAnnoPrecedente: 1_000_000,
    });
    expect(e.superate).toHaveLength(0);
  });

  it('sopra entrambi → oltre soglia', () => {
    const e = calcolaSoglie25Novies({
      ...vuoto,
      conLavoratori: true,
      contributiScaduti: 40_000,
      contributiDovutiAnnoPrecedente: 50_000, // 30% = 15.000
    });
    expect(e.superate.map((r) => r.ente)).toEqual(['INPS']);
  });

  it('senza lavoratori: 5.000 € esatti non superano ("superiore a")', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, conLavoratori: false, contributiScaduti: 5_000 });
    expect(e.superate).toHaveLength(0);
  });

  it('le due righe INPS non si applicano mai insieme', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, conLavoratori: true, contributiScaduti: 1 });
    expect(e.righe.filter((r) => r.ente === 'INPS' && r.applicabile)).toHaveLength(1);
  });

  it('lavoratori non dichiarati: nessuna riga INPS applicata, e lo dichiara', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, contributiScaduti: 900_000 });
    expect(e.righe.filter((r) => r.ente === 'INPS' && r.applicabile)).toHaveLength(0);
    expect(e.datiMancanti.some((d) => d.includes('lavoratori'))).toBe(true);
  });
});

describe('le sanzioni presunte non entrano nel test', () => {
  it('contributi sotto, totale con sanzioni sopra → resta sotto, ma è segnalato', () => {
    const e = calcolaSoglie25Novies({
      ...vuoto,
      conLavoratori: false,
      contributiScaduti: 4_000,
      sanzioniPresunte: 2_000,
    });
    expect(e.superate).toHaveLength(0);
    expect(e.inpsSopraSoloConSanzioni).toBe(true);
  });

  it('se i contributi bastano da soli, il flag non si accende', () => {
    const e = calcolaSoglie25Novies({
      ...vuoto,
      conLavoratori: false,
      contributiScaduti: 9_000,
      sanzioniPresunte: 3_000,
    });
    expect(e.superate).toHaveLength(1);
    expect(e.inpsSopraSoloConSanzioni).toBe(false);
  });
});

describe('INAIL', () => {
  it('oltre 5.000 € → oltre soglia', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, premiInail: 5_001 }, 'INAIL');
    expect(e.superate).toHaveLength(1);
  });

  it('non dipende da altri dati', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, premiInail: 100 }, 'INAIL');
    expect(e.righe[0].esito).toBe('sotto');
  });
});

describe('Agenzia delle Entrate (IVA) — due vie autonome', () => {
  it('oltre 20.000 € scatta comunque, anche senza volume d’affari', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, ivaScaduta: 20_001 }, 'AGENZIA_ENTRATE');
    expect(e.superate).toHaveLength(1);
    expect(e.righe[0].motivo).toContain('in ogni caso');
  });

  it('sotto 20.000 €: servono i due requisiti congiunti', () => {
    // 10.000 € su 80.000 di volume = 12,5%, oltre il 10% e oltre 5.000 €.
    const e = calcolaSoglie25Novies(
      { ...vuoto, ivaScaduta: 10_000, volumeAffari: 80_000 },
      'AGENZIA_ENTRATE'
    );
    expect(e.superate).toHaveLength(1);
  });

  it('sotto 20.000 € e sotto il 10% del volume → sotto soglia', () => {
    // 10.000 € su 500.000 = 2%.
    const e = calcolaSoglie25Novies(
      { ...vuoto, ivaScaduta: 10_000, volumeAffari: 500_000 },
      'AGENZIA_ENTRATE'
    );
    expect(e.superate).toHaveLength(0);
  });

  it('sotto 20.000 € senza volume d’affari → non determinabile, non "sotto"', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, ivaScaduta: 10_000 }, 'AGENZIA_ENTRATE');
    expect(e.righe[0].esito).toBe('non_determinabile');
    expect(e.superate).toHaveLength(0);
  });
});

describe('Agenzia Entrate-Riscossione — soglia per forma giuridica', () => {
  it('150.000 € supera per impresa individuale ma non per società di persone', () => {
    const ind = calcolaSoglie25Novies(
      { ...vuoto, creditiAffidati: 150_000, formaAER: 'IMPRESA_INDIVIDUALE' },
      'AGENZIA_RISCOSSIONE'
    );
    expect(ind.superate).toHaveLength(1);

    const soc = calcolaSoglie25Novies(
      { ...vuoto, creditiAffidati: 150_000, formaAER: 'SOCIETA_PERSONE' },
      'AGENZIA_RISCOSSIONE'
    );
    expect(soc.superate).toHaveLength(0);
  });

  it('300.000 € non supera per una S.r.l. (soglia 500.000 €)', () => {
    const e = calcolaSoglie25Novies(
      { ...vuoto, creditiAffidati: 300_000, formaAER: 'ALTRE_SOCIETA' },
      'AGENZIA_RISCOSSIONE'
    );
    expect(e.superate).toHaveLength(0);
  });

  it('una sola delle tre righe è applicabile per volta', () => {
    const e = calcolaSoglie25Novies(
      { ...vuoto, creditiAffidati: 999_999, formaAER: 'SOCIETA_PERSONE' },
      'AGENZIA_RISCOSSIONE'
    );
    expect(e.righe.filter((r) => r.applicabile)).toHaveLength(1);
  });

  it('forma non riconosciuta: nessuna applicata, e lo dichiara', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, creditiAffidati: 999_999 });
    expect(e.righe.filter((r) => r.ente === 'AGENZIA_RISCOSSIONE' && r.applicabile)).toHaveLength(
      0
    );
    expect(e.datiMancanti.some((d) => d.includes('Forma giuridica'))).toBe(true);
  });
});

describe('le due letture: Ricevente e Redigente', () => {
  it('Ricevente INAIL vede solo le righe INAIL, non quelle INPS', () => {
    const e = calcolaSoglie25Novies(
      { ...vuoto, conLavoratori: true, contributiScaduti: 900_000, premiInail: 100 },
      'INAIL'
    );
    expect(e.righe.every((r) => r.ente === 'INAIL')).toBe(true);
    expect(e.superate).toHaveLength(0); // l'esposizione INPS non lo riguarda
  });

  it('Redigente vede tutte le righe e può superarne più di una', () => {
    const e = calcolaSoglie25Novies({
      ...vuoto,
      conLavoratori: false,
      contributiScaduti: 9_000,
      premiInail: 9_000,
      ivaScaduta: 30_000,
      creditiAffidati: 600_000,
      formaAER: 'ALTRE_SOCIETA',
    });
    expect(e.superate.map((r) => r.ente).sort()).toEqual([
      'AGENZIA_ENTRATE',
      'AGENZIA_RISCOSSIONE',
      'INAIL',
      'INPS',
    ]);
  });
});

describe('il requisito dei 90 giorni è sempre dichiarato', () => {
  it('anche quando tutto è sotto soglia', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, conLavoratori: false, contributiScaduti: 1 });
    expect(e.datiMancanti.some((d) => d.includes('90 giorni'))).toBe(true);
  });
});
