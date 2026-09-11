import { describe, it, expect } from 'vitest';
import {
  analizzaDenunce,
  analizzaInadempienze,
  analizzaVersamenti,
  scadenzaLegale,
  scadenzaVersamento,
} from './analisi';

// I numeri di questi test vengono dai file reali forniti da Ercole
// (Elenco_denunce e Lista_Inadempienze), non da esempi inventati.

const verifica = new Date(Date.UTC(2026, 8, 11)); // 11/09/2026

describe('scadenza legale della denuncia', () => {
  it('è l’ultimo giorno del mese SUCCESSIVO al periodo', () => {
    expect(scadenzaLegale(2026, 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(scadenzaLegale(2024, 1).toISOString().slice(0, 10)).toBe('2024-02-29'); // bisestile
    expect(scadenzaLegale(2026, 7).toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(scadenzaLegale(2026, 12).toISOString().slice(0, 10)).toBe('2027-01-31');
  });
});

describe('finestra del dovuto', () => {
  const righe = [
    { periodo: '06/2026', dataPresentazione: '17/07/2026', saldo: 14163 },
    { periodo: '07/2026', dataPresentazione: '20/08/2026', saldo: 10000 },
    { periodo: '08/2026', dataPresentazione: null, saldo: 9000 },
  ];

  it('all’11/09/2026 l’ultimo periodo dovuto è luglio', () => {
    // Luglio scadeva il 31/08: dovuto. Agosto scade il 30/09: non ancora.
    expect(analizzaDenunce(righe, verifica).ultimoPeriodoDovuto).toBe('07/2026');
  });

  it('i periodi non ancora esigibili NON entrano nel dovuto', () => {
    const a = analizzaDenunce(righe, verifica);
    expect(a.dovutoPerAnno[2026]).toBe(14163 + 10000); // agosto escluso
  });
});

describe('i buchi non sono zeri', () => {
  it('un periodo assente dentro la finestra è una denuncia NON PRESENTATA', () => {
    // Caso reale: il file di Ercole arriva a 06/2026, ma all'11/09 luglio era
    // dovuto. Non vale zero: è un segnale.
    const a = analizzaDenunce(
      [{ periodo: '06/2026', dataPresentazione: '17/07/2026', saldo: 14163 }],
      verifica,
      2026
    );
    expect(a.periodiMancanti).toContain('07/2026');
    expect(a.dovutoPerAnno[2026]).toBe(14163); // non sommato come zero
  });

  it('i periodi fuori finestra non risultano mancanti', () => {
    const a = analizzaDenunce(
      [{ periodo: '06/2026', dataPresentazione: '17/07/2026', saldo: 1 }],
      verifica,
      2026
    );
    expect(a.periodiMancanti).not.toContain('08/2026');
  });
});

describe('ritardo di oltre 90 giorni', () => {
  const righe = [
    // gennaio 2026: scade 28/02, presentata 25/02 → puntuale
    { periodo: '01/2026', dataPresentazione: '25/02/2026', saldo: 17482 },
    // febbraio 2026: scade 31/03, presentata 30/09 → 183 giorni
    { periodo: '02/2026', dataPresentazione: '30/09/2026', saldo: 17767 },
  ];

  it('conta i periodi oltre i 90 giorni e il loro importo', () => {
    const a = analizzaDenunce(righe, new Date(Date.UTC(2026, 11, 1)));
    expect(a.oltre90Giorni.map((p) => p.periodo)).toEqual(['02/2026']);
    expect(a.importoOltre90Giorni).toBe(17767);
  });

  it('la MEDIA non sostituisce il test: nasconde il caso che conta', () => {
    // Undici periodi puntuali e uno in ritardo di 300 giorni: la media è 25,
    // ben sotto i 90. Ma la norma guarda il SINGOLO versamento in ritardo,
    // non la condotta media — ed è per questo che il test conta i periodi
    // oltre soglia invece di mediarli.
    const undiciPuntuali = Array.from({ length: 11 }, (_, i) => ({
      periodo: `${String(i + 1).padStart(2, '0')}/2025`,
      dataPresentazione: `15/${String(i + 2).padStart(2, '0')}/2025`,
      saldo: 1000,
    }));
    const unoInRitardo = {
      periodo: '12/2025',
      dataPresentazione: '30/11/2026', // scade 31/01/2026 → ~303 giorni
      saldo: 50_000,
    };
    const a = analizzaDenunce([...undiciPuntuali, unoInRitardo], new Date(Date.UTC(2026, 11, 1)));
    expect(a.ritardoMedioGiorni).toBeLessThan(90);
    expect(a.oltre90Giorni).toHaveLength(1);
    expect(a.importoOltre90Giorni).toBe(50_000);
  });

  it('una denuncia mai presentata non ha ritardo calcolabile', () => {
    const a = analizzaDenunce(
      [{ periodo: '01/2026', dataPresentazione: null, saldo: 100 }],
      new Date(Date.UTC(2026, 11, 1))
    );
    expect(a.periodi[0].giorniRitardo).toBeNull();
    expect(a.oltre90Giorni).toHaveLength(0);
  });
});

describe('inadempienze: gli accrediti non compensano fra anni', () => {
  it('un anno con accrediti superiori non abbassa il totale', () => {
    // Caso reale: il 2022 chiude a -13.683 €. Sottrarlo significherebbe far
    // cancellare da un accredito 2022 un debito 2025.
    const a = analizzaInadempienze([
      { inizioPeriodo: '2022/03', importoAddebitato: 30931, importoAccreditato: 44614 },
      { inizioPeriodo: '2025/03', importoAddebitato: 354599.7, importoAccreditato: 62867.95 },
    ]);
    expect(a.nettoPerAnno[2022]).toBeLessThan(0);
    expect(a.anniConSaldoNegativo).toContain(2022);
    expect(Math.round(a.totaleNonVersato)).toBe(291732); // solo il 2025
  });

  it('somma i netti positivi di più anni', () => {
    const a = analizzaInadempienze([
      { inizioPeriodo: '2024/01', importoAddebitato: 1000, importoAccreditato: 200 },
      { inizioPeriodo: '2025/01', importoAddebitato: 500, importoAccreditato: 100 },
    ]);
    expect(a.totaleNonVersato).toBe(1200);
  });
});

describe('versamenti F24: filtri ed esclusioni', () => {
  const denunce = [{ periodo: '01/2025', dataPresentazione: '25/02/2025', saldo: 10_000 }];
  const verifica = new Date(Date.UTC(2026, 8, 11));

  it('la scadenza del VERSAMENTO è il 16 del mese successivo, non fine mese', () => {
    expect(scadenzaVersamento(2025, 1).toISOString().slice(0, 10)).toBe('2025-02-16');
    expect(scadenzaVersamento(2025, 12).toISOString().slice(0, 10)).toBe('2026-01-16');
  });

  it('i codici tributo diversi da DM10 non contano come versamento', () => {
    // DMR sono rettifiche: correggono i DM ma non sono versamenti della
    // gestione. Contarli abbatterebbe il residuo.
    const a = analizzaVersamenti(
      denunce,
      [
        {
          periodo: '01/2025',
          dataVersamento: '16/02/2025',
          importo: 10_000,
          codiceTributo: 'DMRAA',
          esito: 'Ripartito',
          stato: 'Definito',
        },
      ],
      verifica
    );
    expect(a.residuoRicostruito).toBe(10_000);
    expect(a.scartate.some((s) => s.motivo.includes('DM10'))).toBe(true);
  });

  it('le righe stornate o su altre gestioni non contano come versamento', () => {
    // Nel campione reale sono 49.006 €, di cui 29.620 € su un solo periodo:
    // contarle faceva risultare pagato ciò che pagato non era.
    const a = analizzaVersamenti(
      denunce,
      [
        {
          periodo: '01/2025',
          dataVersamento: '16/02/2025',
          importo: 10_000,
          codiceTributo: 'DM10A',
          esito: 'Altre gestioni',
          stato: 'Stornato',
        },
      ],
      verifica
    );
    expect(a.residuoRicostruito).toBe(10_000);
    expect(a.scartate.some((s) => s.motivo.includes('stornate'))).toBe(true);
  });

  it('un versamento valido abbatte il residuo', () => {
    const a = analizzaVersamenti(
      denunce,
      [
        {
          periodo: '01/2025',
          dataVersamento: '16/02/2025',
          importo: 4_000,
          codiceTributo: 'DM10A',
          esito: 'Ripartito',
          stato: 'Definito',
        },
      ],
      verifica
    );
    expect(a.residuoRicostruito).toBe(6_000);
    expect(a.periodi[0].giorniRitardo).toBe(0);
  });
});

describe('versamenti F24: il ritardo', () => {
  const verifica = new Date(Date.UTC(2026, 8, 11));
  const den = [{ periodo: '01/2025', dataPresentazione: '25/02/2025', saldo: 10_000 }];

  it('un versamento oltre 90 giorni dalla scadenza è contato', () => {
    const a = analizzaVersamenti(
      den,
      [
        {
          periodo: '01/2025',
          dataVersamento: '15/07/2025',
          importo: 100,
          codiceTributo: 'DM10A',
          esito: 'Ripartito',
          stato: 'Definito',
        },
      ],
      verifica
    );
    expect(a.oltre90Giorni).toHaveLength(1);
  });

  it('un periodo MAI versato conta come ritardo in corso, non come non calcolabile', () => {
    // È il caso peggiore: trattarlo come "ritardo non misurabile" lo
    // escluderebbe proprio dal requisito che dovrebbe farlo scattare.
    const a = analizzaVersamenti(den, [], verifica);
    expect(a.maiVersati).toHaveLength(1);
    expect(a.dovutoInRitardo).toBe(10_000);
  });

  it('un periodo scaduto da meno di 90 giorni e non versato NON conta ancora', () => {
    const recente = [{ periodo: '07/2026', dataPresentazione: '20/08/2026', saldo: 5_000 }];
    const a = analizzaVersamenti(recente, [], verifica); // scadenza 16/08/2026
    expect(a.maiVersati).toHaveLength(0);
  });

  it('un versamento in eccesso non genera credito su altri periodi', () => {
    const a = analizzaVersamenti(
      den,
      [
        {
          periodo: '01/2025',
          dataVersamento: '16/02/2025',
          importo: 50_000,
          codiceTributo: 'DM10A',
          esito: 'Ripartito',
          stato: 'Definito',
        },
      ],
      verifica
    );
    expect(a.residuoRicostruito).toBe(0); // non -40.000
  });
});

describe('mai nostre elaborazioni: solo dati ufficiali', () => {
  // Principio fissato da Ercole. La distinzione che lo rende applicabile:
  // AGGREGARE un dato ufficiale (sommare i saldi delle denunce, calcolare il
  // 30% di quella somma) resta tracciabile riga per riga fino al file
  // dell'ente — chiunque rifà il conto e trova lo stesso numero.
  // RICOSTRUIRE una grandezza che l'ente non ha mai certificato produce una
  // cifra che esiste solo qui, e non può fondare un giudizio.

  const verifica = new Date(Date.UTC(2026, 8, 11));
  const den = [{ periodo: '01/2025', dataPresentazione: '25/02/2025', saldo: 10_000 }];

  it('il debito complessivo viene dalla Lista Inadempienze, non dal residuo', () => {
    const ufficiale = analizzaInadempienze([
      { inizioPeriodo: '2025/01', importoAddebitato: 6_000, importoAccreditato: 0 },
    ]);
    const ricostruito = analizzaVersamenti(den, [], verifica);
    // Il residuo ricostruito è diverso dal certificato: è normale, e non
    // autorizza a preferirlo.
    expect(ricostruito.residuoRicostruito).toBe(10_000);
    expect(ufficiale.totaleNonVersato).toBe(6_000);
  });

  it('l’importo in ritardo aggrega il DOVUTO ufficiale, non il residuo', () => {
    const a = analizzaVersamenti(
      den,
      [
        {
          periodo: '01/2025',
          dataVersamento: '15/09/2025',
          importo: 3_000,
          codiceTributo: 'DM10A',
          esito: 'Ripartito',
          stato: 'Definito',
        },
      ],
      verifica
    );
    // 10.000 è il saldo dichiarato nella denuncia, non 7.000 di differenza.
    expect(a.dovutoInRitardo).toBe(10_000);
  });
});
