import { describe, it, expect } from 'vitest';
import { calcolaGriglia25Novies, SOGLIE_INPS_25NOVIES } from './calcolo';

// I numeri di questi test vengono dal testo dell'art. 25-novies, comma 1,
// lettera a) CCII, non da stime. Se un giorno una riforma cambia le soglie,
// è qui che il cambiamento deve rompere qualcosa.

const base = {
  conLavoratori: null as boolean | null,
  contributiDovutiAnnoPrecedente: null as number | null,
  annoContributiDovuti: null as number | null,
  organoDiControlloNominato: null as boolean | null,
  prospettiva: 'ENTE' as 'ENTE' | 'NON_ENTE',
};

describe('soglie di legge', () => {
  it('sono quelle dell’articolo: 30%, 15.000 €, 5.000 €, 90 giorni', () => {
    expect(SOGLIE_INPS_25NOVIES.percentualeConLavoratori).toBe(0.3);
    expect(SOGLIE_INPS_25NOVIES.importoConLavoratori).toBe(15_000);
    expect(SOGLIE_INPS_25NOVIES.importoSenzaLavoratori).toBe(5_000);
    expect(SOGLIE_INPS_25NOVIES.giorniRitardo).toBe(90);
  });
});

describe('impresa CON lavoratori — i due requisiti sono congiunti', () => {
  it('sopra il 30% ma sotto i 15.000 € → NON oltre soglia', () => {
    // 12.000 € su 20.000 dovuti: il 60%, ben oltre il 30%. Ma sotto 15.000 €.
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: true,
      contributiDovutiAnnoPrecedente: 20_000,
      righe: [{ anno: 2025, contabilizzato: 12_000, sanzioniPresunte: 0 }],
    });
    expect(g.oltreSoglia).toBe(false);
  });

  it('sopra i 15.000 € ma sotto il 30% → NON oltre soglia', () => {
    // 16.000 € su 1.000.000 dovuti: 1,6%, sotto il 30%.
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: true,
      contributiDovutiAnnoPrecedente: 1_000_000,
      righe: [{ anno: 2025, contabilizzato: 16_000, sanzioniPresunte: 0 }],
    });
    expect(g.oltreSoglia).toBe(false);
  });

  it('sopra entrambi → oltre soglia', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: true,
      contributiDovutiAnnoPrecedente: 50_000, // 30% = 15.000
      righe: [{ anno: 2025, contabilizzato: 40_000, sanzioniPresunte: 0 }],
    });
    expect(g.oltreSoglia).toBe(true);
    expect(g.sogliaPercentuale).toBe(15_000);
  });

  it('senza il totale dei contributi dovuti l’esito non è determinabile', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: true,
      righe: [{ anno: 2025, contabilizzato: 900_000, sanzioniPresunte: 0 }],
    });
    // Esposizione enorme, ma il 30% non è calcolabile: non si afferma nulla.
    expect(g.oltreSoglia).toBe(false);
    expect(g.soglie[0].esito).toBe('non_determinabile');
    expect(g.datiMancanti.some((d) => d.includes('contributi dovuti'))).toBe(true);
  });
});

describe('impresa SENZA lavoratori — solo importo, nessuna percentuale', () => {
  it('oltre 5.000 € → oltre soglia anche senza il dato dei contributi dovuti', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [{ anno: 2025, contabilizzato: 5_001, sanzioniPresunte: 0 }],
    });
    expect(g.oltreSoglia).toBe(true);
  });

  it('esattamente 5.000 € → NON oltre soglia (la norma dice "superiore a")', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [{ anno: 2025, contabilizzato: 5_000, sanzioniPresunte: 0 }],
    });
    expect(g.oltreSoglia).toBe(false);
  });

  it('non chiede il dato dei contributi dovuti fra i mancanti', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [{ anno: 2025, contabilizzato: 6_000, sanzioniPresunte: 0 }],
    });
    expect(g.datiMancanti.some((d) => d.includes('contributi dovuti'))).toBe(false);
  });
});

describe('le due righe sono alternative, mai sommabili', () => {
  it('con lavoratori dichiarati, si applica solo la prima riga', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: true,
      contributiDovutiAnnoPrecedente: 50_000,
      righe: [{ anno: 2025, contabilizzato: 40_000, sanzioniPresunte: 0 }],
    });
    expect(g.soglie.filter((s) => s.applicabile)).toHaveLength(1);
    expect(g.soglie[0].applicabile).toBe(true);
  });

  it('senza dichiarazione, nessuna riga è applicabile e non si afferma nulla', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      righe: [{ anno: 2025, contabilizzato: 900_000, sanzioniPresunte: 0 }],
    });
    expect(g.soglie.filter((s) => s.applicabile)).toHaveLength(0);
    expect(g.oltreSoglia).toBe(false);
    expect(g.raccomandazione).toContain('lavoratori subordinati');
  });
});

describe('totali e ripartizione per anno', () => {
  it('somma contabilizzato e VERA non contabilizzato, ordinando per anno', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [
        { anno: 2025, contabilizzato: 3_000, sanzioniPresunte: 500 },
        { anno: 2023, contabilizzato: 1_000, sanzioniPresunte: 200 },
        { anno: 2024, contabilizzato: 2_000, sanzioniPresunte: 0 },
      ],
    });
    expect(g.righe.map((r) => r.anno)).toEqual([2023, 2024, 2025]);
    expect(g.totaleContabilizzato).toBe(6_000);
    expect(g.totaleSanzioniPresunte).toBe(700);
    expect(g.totaleComplessivo).toBe(6_700);
  });

  it('le righe senza anno finiscono in fondo, concorrono ai totali, e sono dichiarate', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [
        { anno: null, contabilizzato: 0, sanzioniPresunte: 4_000 },
        { anno: 2024, contabilizzato: 2_000, sanzioniPresunte: 0 },
      ],
    });
    expect(g.righe[g.righe.length - 1].anno).toBeNull();
    expect(g.totaleComplessivo).toBe(6_000);
    expect(g.datiMancanti.some((d) => d.includes('non è attribuibile a un anno'))).toBe(true);
  });
});

describe('la raccomandazione non afferma mai un obbligo non dimostrato', () => {
  it('oltre soglia: chiede di accertare i 90 giorni PRIMA di comunicare', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      organoDiControlloNominato: true,
      righe: [{ anno: 2025, contabilizzato: 80_000, sanzioniPresunte: 0 }],
    });
    expect(g.raccomandazione).toContain('90 giorni');
    expect(g.raccomandazione).toContain('collegio sindacale');
    // Non deve mai dire che la segnalazione È dovuta.
    expect(g.raccomandazione).not.toMatch(/segnalazione (è|e) dovuta/i);
  });

  it('senza organo di controllo nominato, il destinatario è il solo imprenditore', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      organoDiControlloNominato: false,
      righe: [{ anno: 2025, contabilizzato: 80_000, sanzioniPresunte: 0 }],
    });
    expect(g.raccomandazione).toContain('nessun organo di controllo');
  });

  it('il requisito dei 90 giorni è SEMPRE fra i dati mancanti, anche sotto soglia', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [{ anno: 2025, contabilizzato: 100, sanzioniPresunte: 0 }],
    });
    expect(g.datiMancanti.some((d) => d.includes('90 giorni'))).toBe(true);
  });
});

describe('le sanzioni presunte NON entrano nel test', () => {
  it('contributi sotto soglia + sanzioni che la supererebbero → resta SOTTO', () => {
    // Impresa senza lavoratori: soglia 5.000 €.
    // Contributi 4.000 (sotto), sanzioni presunte 2.000 → totale 6.000 (sopra).
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [{ anno: 2025, contabilizzato: 4_000, sanzioniPresunte: 2_000 }],
    });
    expect(g.oltreSoglia).toBe(false);
    expect(g.sopraSoloConSanzioni).toBe(true);
    expect(g.totaleComplessivo).toBe(6_000);
  });

  it('quel caso produce una raccomandazione che vieta di fondarci la segnalazione', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [{ anno: 2025, contabilizzato: 4_000, sanzioniPresunte: 2_000 }],
    });
    expect(g.raccomandazione).toContain('NON fondano da sole la segnalazione');
  });

  it('con lavoratori: le sanzioni non fanno superare il 30%', () => {
    // Contributi dovuti 100.000 → soglia 30.000.
    // Contributi non versati 25.000 (sotto), sanzioni 10.000 → totale 35.000.
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: true,
      contributiDovutiAnnoPrecedente: 100_000,
      righe: [{ anno: 2025, contabilizzato: 25_000, sanzioniPresunte: 10_000 }],
    });
    expect(g.oltreSoglia).toBe(false);
    expect(g.sopraSoloConSanzioni).toBe(true);
  });

  it('se i contributi da soli sono oltre soglia, l’esito non dipende dalle sanzioni', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [{ anno: 2025, contabilizzato: 9_000, sanzioniPresunte: 3_000 }],
    });
    expect(g.oltreSoglia).toBe(true);
    expect(g.sopraSoloConSanzioni).toBe(false);
  });

  it('la natura presuntiva delle sanzioni è sempre dichiarata quando ce ne sono', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [{ anno: 2025, contabilizzato: 1_000, sanzioniPresunte: 400 }],
    });
    expect(g.datiMancanti.some((d) => d.includes('PRESUNZIONE'))).toBe(true);
  });

  it('senza sanzioni non si dichiara nulla di superfluo', () => {
    const g = calcolaGriglia25Novies({
      ...base,
      conLavoratori: false,
      righe: [{ anno: 2025, contabilizzato: 1_000, sanzioniPresunte: 0 }],
    });
    expect(g.datiMancanti.some((d) => d.includes('PRESUNZIONE'))).toBe(false);
    expect(g.sopraSoloConSanzioni).toBe(false);
  });
});

describe('prospettiva: la soglia è la stessa, la raccomandazione no', () => {
  const oltre = {
    ...base,
    conLavoratori: false as boolean | null,
    righe: [{ anno: 2025, contabilizzato: 80_000, sanzioniPresunte: 0 }],
  };

  it('il calcolo NON cambia fra Ente e Redigente', () => {
    const e = calcolaGriglia25Novies({ ...oltre, prospettiva: 'ENTE' });
    const r = calcolaGriglia25Novies({ ...oltre, prospettiva: 'NON_ENTE' });
    expect(e.oltreSoglia).toBe(r.oltreSoglia);
    expect(e.totaleContabilizzato).toBe(r.totaleContabilizzato);
    expect(e.soglie.map((x) => x.esito)).toEqual(r.soglie.map((x) => x.esito));
  });

  it('all’Ente dice di inviare la comunicazione', () => {
    const e = calcolaGriglia25Novies({ ...oltre, prospettiva: 'ENTE' });
    expect(e.raccomandazione).toContain('inviare la comunicazione');
  });

  it('al Redigente NON dice di inviare nulla: lui non comunica', () => {
    const r = calcolaGriglia25Novies({ ...oltre, prospettiva: 'NON_ENTE' });
    expect(r.raccomandazione).not.toContain('inviare la comunicazione');
    expect(r.raccomandazione).toContain('vincolo di tempo');
  });

  it('anche al Redigente il requisito dei 90 giorni resta non dimostrato', () => {
    const r = calcolaGriglia25Novies({ ...oltre, prospettiva: 'NON_ENTE' });
    expect(r.raccomandazione).toContain('90 giorni');
    expect(r.datiMancanti.some((d) => d.includes('90 giorni'))).toBe(true);
  });
});
