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
  // I test sugli importi dichiarano soddisfatti i requisiti temporali: qui si
  // verifica la logica delle soglie. Il tempo ha i suoi test, più sotto.
  ritardoOltre90Giorni: true,
  ritardoInail: true,
  requisitiAerVerificati: true,
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
    expect(e.righe[0].motivo).toContain('via alternativa');
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

describe('requisito dei 90 giorni: per fattispecie, non globale', () => {
  // Verifica di Libra (parte B): il ritardo è un requisito di INPS, INAIL e
  // Agente della Riscossione, ciascuno con le sue fonti; NON dell'IVA.
  const inps = {
    ...vuoto,
    conLavoratori: true,
    contributiScaduti: 50_000,
    contributiDovutiAnnoPrecedente: 100_000,
  };
  const rigaInps = (e: ReturnType<typeof calcolaSoglie25Novies>) =>
    e.righe.find((r) => r.ambito.includes('CON lavoratori'));

  it('INPS oltre soglia CON ritardo accertato: presupposti integrati', () => {
    expect(rigaInps(calcolaSoglie25Novies(inps, 'INPS'))?.esito).toBe('sopra');
  });

  it('INPS oltre soglia SENZA verifica del ritardo: non determinabile, non "sopra"', () => {
    const r = rigaInps(calcolaSoglie25Novies({ ...inps, ritardoOltre90Giorni: null }, 'INPS'));
    expect(r?.esito).toBe('non_determinabile');
    expect(r?.motivo).toContain('Elenco Deleghe');
  });

  it('INPS oltre soglia ma ritardo ASSENTE: presupposti non integrati', () => {
    const r = rigaInps(calcolaSoglie25Novies({ ...inps, ritardoOltre90Giorni: false }, 'INPS'));
    expect(r?.esito).toBe('sotto');
    expect(r?.motivo).toContain('NON integrato');
  });

  it('ritardo assente decide anche senza i contributi dovuti', () => {
    // Requisiti congiunti: se manca il tempo, il 30% non serve a nulla.
    const r = rigaInps(
      calcolaSoglie25Novies(
        { ...inps, contributiDovutiAnnoPrecedente: null, ritardoOltre90Giorni: false },
        'INPS'
      )
    );
    expect(r?.esito).toBe('sotto');
  });

  it('INAIL oltre soglia senza verifica del ritardo: non determinabile', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, premiInail: 9_000, ritardoInail: null }, 'INAIL');
    expect(e.righe[0].esito).toBe('non_determinabile');
  });

  it('IVA: il ritardo NON si applica, l’esito non dipende da quel dato', () => {
    const conRitardoIgnoto = calcolaSoglie25Novies(
      { ...vuoto, ivaScaduta: 25_000, ritardoOltre90Giorni: null, ritardoInail: null },
      'AGENZIA_ENTRATE'
    );
    expect(conRitardoIgnoto.righe[0].esito).toBe('sopra');
    expect(conRitardoIgnoto.righe[0].motivo).toContain('non si applica il requisito dei 90 giorni');
  });

  it('Agente della Riscossione oltre soglia senza i requisiti della lettera d): non determinabile', () => {
    const r = calcolaSoglie25Novies(
      {
        ...vuoto,
        creditiAffidati: 600_000,
        formaAER: 'ALTRE_SOCIETA',
        requisitiAerVerificati: null,
      },
      'AGENZIA_RISCOSSIONE'
    ).righe.find((x) => x.applicabile);
    expect(r?.esito).toBe('non_determinabile');
    expect(r?.motivo).toContain('data di affidamento');
  });

  it('l’applicabilità nel tempo (comma 4) è dichiarata come non verificata', () => {
    const e = calcolaSoglie25Novies(vuoto);
    expect(e.datiMancanti.some((d) => d.includes('comma 4'))).toBe(true);
  });
});

describe('lessico: mai "segnalazione dovuta"', () => {
  // Il motore dichiarava in testa che oltre soglia non è mai segnalazione
  // dovuta, e poi lo scriveva nel motivo dell'IVA.
  it('nessun motivo contiene la formula vietata', () => {
    const e = calcolaSoglie25Novies({
      ...vuoto,
      conLavoratori: true,
      contributiScaduti: 50_000,
      contributiDovutiAnnoPrecedente: 100_000,
      premiInail: 9_000,
      ivaScaduta: 25_000,
      creditiAffidati: 600_000,
      formaAER: 'ALTRE_SOCIETA',
    });
    expect(e.righe.some((r) => /segnalazione dovuta/i.test(r.motivo))).toBe(false);
  });
});

describe('soglie configurate per spazio', () => {
  it('senza parametri si applicano i valori di legge', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, conLavoratori: false, contributiScaduti: 5_001 });
    expect(e.superate).toHaveLength(1);
  });

  it('un parametro modificato cambia davvero l’esito', () => {
    // La configurabilità esiste perché una riforma non imponga una nuova
    // release. Ma serve a poco se poi il motore continua a usare le
    // costanti: questo test verifica che i parametri arrivino davvero.
    const e = calcolaSoglie25Novies(
      { ...vuoto, conLavoratori: false, contributiScaduti: 5_001 },
      undefined,
      { inpsImportoSenzaLavoratori: 10_000 }
    );
    expect(e.superate).toHaveLength(0);
  });

  it('i parametri non forniti restano quelli di legge', () => {
    const e = calcolaSoglie25Novies({ ...vuoto, premiInail: 5_001 }, 'INAIL', {
      inpsImportoSenzaLavoratori: 999_999,
    });
    // INAIL non è stato toccato: resta 5.000 €.
    expect(e.superate).toHaveLength(1);
  });
});

describe('valutare TUTTE le soglie azzera l’esito di uno spazio ENTE', () => {
  // Difetto reale, costato tre giri di correzioni: l'indicatore passava
  // `undefined` come ente e valutava tutte e quattro le righe. Per uno
  // spazio INPS le altre tre non hanno e non avranno mai dati, restano
  // "non determinabili", e una sola basta a rendere l'esito complessivo
  // indeterminato. L'esposizione INPS, anche caricata e corretta, non
  // veniva mai guardata.

  const soloInps = {
    ...vuoto,
    conLavoratori: false,
    contributiScaduti: 80_000,
  };

  it('senza ente: le righe degli altri enti restano non determinabili', () => {
    const e = calcolaSoglie25Novies(soloInps);
    expect(e.nonDeterminabili.length).toBeGreaterThan(0);
  });

  it('con ente INPS: nessuna riga non determinabile, e la soglia è superata', () => {
    const e = calcolaSoglie25Novies(soloInps, 'INPS');
    expect(e.nonDeterminabili).toHaveLength(0);
    expect(e.superate).toHaveLength(1);
  });

  it('lo spazio INAIL non guarda l’esposizione INPS', () => {
    const e = calcolaSoglie25Novies(soloInps, 'INAIL');
    expect(e.superate).toHaveLength(0);
    // E dichiara la propria lacuna, non quella altrui.
    expect(e.nonDeterminabili).toHaveLength(1);
  });
});

describe('soglia assoluta quando il 30% non è calcolabile', () => {
  it('dichiara il superamento assoluto invece di tacere', () => {
    // Caso reale: 1.213.831 € di non versato certificato, denunce assenti
    // quindi contributi dovuti ignoti. Il concorso dei due requisiti non è
    // verificabile — ma tacere che la soglia assoluta è superata di settanta
    // volte nasconde l'informazione più rilevante dietro una formula
    // formalmente corretta.
    const e = calcolaSoglie25Novies(
      {
        ...vuoto,
        conLavoratori: true,
        contributiScaduti: 1_213_831,
        contributiDovutiAnnoPrecedente: null,
      },
      'INPS'
    );
    const riga = e.righe.find((r) => r.ambito.includes('CON lavoratori'));
    expect(riga?.esito).toBe('non_determinabile');
    expect(riga?.motivo).toContain('SUPERATA');
    expect(riga?.motivo).toContain('contributi dovuti');
  });

  it('se la soglia assoluta NON è superata, lo dice ugualmente', () => {
    const e = calcolaSoglie25Novies(
      {
        ...vuoto,
        conLavoratori: true,
        contributiScaduti: 8_000,
        contributiDovutiAnnoPrecedente: null,
      },
      'INPS'
    );
    const riga = e.righe.find((r) => r.ambito.includes('CON lavoratori'));
    expect(riga?.motivo).toContain('non superata');
  });
});

describe('INPS con lavoratori — partite a importo non noto', () => {
  const base = {
    ...vuoto,
    conLavoratori: true,
    contributiScaduti: 10_000,
    contributiDovutiAnnoPrecedente: 100_000, // 30% = 30.000
  };
  const rigaCon = (e: ReturnType<typeof calcolaSoglie25Novies>) =>
    e.righe.find((r) => r.ambito.includes('CON lavoratori'));

  it('senza voci ignote: sotto soglia', () => {
    expect(rigaCon(calcolaSoglie25Novies(base, 'INPS'))?.esito).toBe('sotto');
  });

  it('una partita ignota: "sotto" diventa non determinabile, al singolare', () => {
    const r = rigaCon(calcolaSoglie25Novies({ ...base, vociImportoIgnoto: 1 }, 'INPS'));
    expect(r?.esito).toBe('non_determinabile');
    expect(r?.motivo).toContain('Sui dati quantificati la soglia non è raggiunta');
    expect(r?.motivo).toContain('con 1 partita a importo non noto');
  });

  it('più partite ignote: al plurale', () => {
    const r = rigaCon(calcolaSoglie25Novies({ ...base, vociImportoIgnoto: 3 }, 'INPS'));
    expect(r?.esito).toBe('non_determinabile');
    expect(r?.motivo).toContain('con 3 partite a importo non noto');
  });

  it('la riga resta fra le non determinabili dell’esito complessivo', () => {
    const e = calcolaSoglie25Novies({ ...base, vociImportoIgnoto: 2 }, 'INPS');
    expect(e.nonDeterminabili.map((r) => r.ambito)).toContain(rigaCon(e)?.ambito);
    expect(e.superate).toHaveLength(0);
  });

  it('se la soglia è superata, le voci ignote non cambiano l’esito', () => {
    const r = rigaCon(
      calcolaSoglie25Novies({ ...base, contributiScaduti: 40_000, vociImportoIgnoto: 2 }, 'INPS')
    );
    expect(r?.esito).toBe('sopra');
    expect(r?.motivo).not.toContain('importo non noto');
  });

  it('zero voci ignote equivale a nessuna', () => {
    const r = rigaCon(calcolaSoglie25Novies({ ...base, vociImportoIgnoto: 0 }, 'INPS'));
    expect(r?.esito).toBe('sotto');
  });

  it('con voci ignote il flag delle sanzioni non si accende', () => {
    const e = calcolaSoglie25Novies(
      { ...base, contributiScaduti: 20_000, sanzioniPresunte: 20_000, vociImportoIgnoto: 1 },
      'INPS'
    );
    expect(e.inpsSopraSoloConSanzioni).toBe(false);
  });

  it('ritardo assente: l’esito torna "sotto" anche con voci ignote', () => {
    const r = rigaCon(
      calcolaSoglie25Novies({ ...base, vociImportoIgnoto: 1, ritardoOltre90Giorni: false }, 'INPS')
    );
    expect(r?.esito).toBe('sotto');
    expect(r?.motivo).toContain('NON integrato');
  });
});

describe('INPS con lavoratori — sanzioni presunte', () => {
  const base = {
    ...vuoto,
    conLavoratori: true,
    contributiScaduti: 12_000,
    contributiDovutiAnnoPrecedente: 20_000, // 30% = 6.000; manca la soglia dei 15.000
  };

  it('contributi sotto, contributi + sanzioni oltre entrambe le soglie → flag acceso', () => {
    const e = calcolaSoglie25Novies({ ...base, sanzioniPresunte: 5_000 });
    expect(e.superate).toHaveLength(0);
    expect(e.inpsSopraSoloConSanzioni).toBe(true);
  });

  it('con le sanzioni si supera l’importo ma non il 30% → flag spento', () => {
    const e = calcolaSoglie25Novies({
      ...base,
      contributiScaduti: 12_000,
      contributiDovutiAnnoPrecedente: 60_000, // 30% = 18.000
      sanzioniPresunte: 5_000, // totale 17.000
    });
    expect(e.inpsSopraSoloConSanzioni).toBe(false);
  });

  it('con le sanzioni si resta sotto i 15.000 € → flag spento', () => {
    const e = calcolaSoglie25Novies({ ...base, sanzioniPresunte: 2_000 });
    expect(e.inpsSopraSoloConSanzioni).toBe(false);
  });

  it('riga non applicabile (senza lavoratori) → il flag non viene dalla riga CON', () => {
    // 12.000 € superano già i 5.000 € della riga SENZA: nessun flag.
    const e = calcolaSoglie25Novies({ ...base, conLavoratori: false, sanzioniPresunte: 5_000 });
    expect(e.inpsSopraSoloConSanzioni).toBe(false);
  });

  it('lavoratori non dichiarati → nessun flag', () => {
    const e = calcolaSoglie25Novies({ ...base, conLavoratori: null, sanzioniPresunte: 5_000 });
    expect(e.inpsSopraSoloConSanzioni).toBe(false);
  });

  it('il flag è visibile a INPS e a NON_PUBBLICO, non agli altri enti', () => {
    const dati = { ...base, sanzioniPresunte: 5_000 };
    expect(calcolaSoglie25Novies(dati, 'INPS').inpsSopraSoloConSanzioni).toBe(true);
    expect(calcolaSoglie25Novies(dati, 'NON_PUBBLICO').inpsSopraSoloConSanzioni).toBe(true);
    expect(calcolaSoglie25Novies(dati, 'INAIL').inpsSopraSoloConSanzioni).toBe(false);
    expect(calcolaSoglie25Novies(dati, 'AGENZIA_ENTRATE').inpsSopraSoloConSanzioni).toBe(false);
  });

  it('le sanzioni presunte sono dichiarate come presunzione fra i dati mancanti', () => {
    const e = calcolaSoglie25Novies({ ...base, sanzioniPresunte: 5_000 });
    expect(e.datiMancanti.some((d) => d.includes('PRESUNZIONE'))).toBe(true);
    const senza = calcolaSoglie25Novies(base);
    expect(senza.datiMancanti.some((d) => d.includes('PRESUNZIONE'))).toBe(false);
  });
});

describe('INPS con lavoratori — riconciliazione con l’esposizione V.E.R.A.', () => {
  const base = {
    ...vuoto,
    conLavoratori: true,
    contributiScaduti: 10_000,
    contributiDovutiAnnoPrecedente: 100_000,
  };
  const motivoCon = (dati: DatiSoglie) =>
    calcolaSoglie25Novies(dati, 'INPS').righe.find((r) => r.ambito.includes('CON lavoratori'))
      ?.motivo ?? '';

  it('dichiara sempre quale importo è stato confrontato', () => {
    expect(motivoCon(base)).toContain(
      'Importo confrontato: contributi previdenziali scaduti dai valori per le soglie'
    );
    expect(motivoCon(base)).toContain('al netto di sanzioni e interessi');
  });

  it('senza esposizione V.E.R.A. non parla di riconciliazione', () => {
    expect(motivoCon(base)).not.toContain('V.E.R.A.');
    expect(motivoCon({ ...base, esposizioneVera: null })).not.toContain('V.E.R.A.');
  });

  it('senza contributi non dichiara nessun importo confrontato', () => {
    expect(motivoCon({ ...base, contributiScaduti: null, esposizioneVera: 10_000 })).not.toContain(
      'Importo confrontato'
    );
  });

  it('esposizione coincidente → lo dice', () => {
    const m = motivoCon({ ...base, esposizioneVera: 10_000 });
    expect(m).toContain('L’esposizione V.E.R.A. quantificata è');
    expect(m).toContain('coincide con l’importo confrontato');
    expect(m).not.toContain('va riconciliata');
  });

  it('differenza entro 0,50 € → considerata coincidente', () => {
    expect(motivoCon({ ...base, esposizioneVera: 10_000.5 })).toContain('coincide');
    expect(motivoCon({ ...base, esposizioneVera: 9_999.5 })).toContain('coincide');
  });

  it('differenza oltre 0,50 € → va riconciliata', () => {
    const m = motivoCon({ ...base, esposizioneVera: 10_000.51 });
    expect(m).toContain('i due importi non coincidono');
    expect(m).toContain('va riconciliata');
  });

  it('con sanzioni presunte ne indica la quota nell’esposizione', () => {
    const m = motivoCon({ ...base, esposizioneVera: 14_000, sanzioniPresunte: 4_000 });
    expect(m).toMatch(/di cui sanzioni presunte 4\.?000 €/);
    expect(m).toContain('va riconciliata');
  });

  it('senza sanzioni non cita la quota', () => {
    expect(motivoCon({ ...base, esposizioneVera: 10_000 })).not.toContain('di cui sanzioni');
  });

  it('oltre soglia: il termine di 60 giorni segue la riconciliazione', () => {
    const m = motivoCon({ ...base, contributiScaduti: 40_000, esposizioneVera: 40_000 });
    expect(m).toContain('entro 60 giorni');
    expect(m.indexOf('Importo confrontato')).toBeLessThan(m.indexOf('entro 60 giorni'));
  });

  it('non oltre soglia: nessun termine di invio', () => {
    expect(motivoCon({ ...base, esposizioneVera: 10_000 })).not.toContain('entro 60 giorni');
  });

  // Da valutare: la riconciliazione con V.E.R.A. (calcolo.ts ~307-318) è
  // aggiunta solo alla riga INPS «CON lavoratori». Per un'impresa SENZA
  // lavoratori con esposizioneVera 14.000 € e contributi 10.000 € la riga
  // applicabile non dice né quale importo è stato confrontato né che la
  // differenza va riconciliata.
  it.todo('riga INPS SENZA lavoratori: dovrebbe riportare anche la riconciliazione V.E.R.A.');
});
