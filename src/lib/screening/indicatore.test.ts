import { describe, it, expect } from 'vitest';
import { calcolaAttenzione, ANNI_GIOVANE_IMPRESA, type IngressoIndicatore } from './indicatore';

// L'indicatore decide se un fascicolo va attenzionato. Gli errori qui non
// sono estetici: un falso "nessuna criticità" su un'impresa da segnalare è il
// guasto peggiore che questa piattaforma possa produrre.

const completo: IngressoIndicatore = {
  annoCostituzione: 2010,
  annoCorrente: 2026,
  xbrlPresente: true,
  patrimonioNetto: 500_000,
  indiciViolati: 0,
  sogliaSuperata: false,
  esposizione: 1_000,
  sogliaApplicabile: 5_000,
  coloreQualitativo: 'verde',
};

describe('non compensatorietà', () => {
  it('una soglia superata resta ROSSO anche con tutto il resto ottimo', () => {
    // È il caso che una media ponderata sbaglierebbe: bilancio solido,
    // nessun indice violato, questionario impeccabile — e l'ente è comunque
    // tenuto a segnalare.
    const a = calcolaAttenzione({
      ...completo,
      sogliaSuperata: true,
      patrimonioNetto: 50_000_000,
      indiciViolati: 0,
      coloreQualitativo: 'verde',
    });
    expect(a.esito).toBe('ROSSO');
    expect(a.fattoreDeterminante).toContain('Soglia');
  });

  it('il quadro qualitativo può peggiorare ma non migliorare', () => {
    const peggiora = calcolaAttenzione({ ...completo, coloreQualitativo: 'rosso' });
    expect(peggiora.esito).toBe('GIALLO');

    // Un questionario perfetto non cancella gli indici violati.
    const nonMigliora = calcolaAttenzione({
      ...completo,
      indiciViolati: 2,
      coloreQualitativo: 'verde',
    });
    expect(nonMigliora.esito).toBe('GIALLO');
  });

  it('il quadro qualitativo da solo non arriva mai al rosso', () => {
    const a = calcolaAttenzione({ ...completo, coloreQualitativo: 'rosso' });
    expect(a.esito).not.toBe('ROSSO');
  });
});

describe('l’assenza di dati è un segnale, non una neutralità', () => {
  it('soglie non determinabili → ROSSO, approfondimenti necessari', () => {
    const a = calcolaAttenzione({ ...completo, sogliaSuperata: null });
    expect(a.esito).toBe('ROSSO');
    expect(a.etichetta).toBe('Approfondimenti necessari');
    expect(a.daAccertare.some((d) => d.includes('Soglie'))).toBe(true);
  });

  it('quadro qualitativo non compilato: si dichiara, ma NON blocca il giudizio', () => {
    // È una dimensione ACCESSORIA: può solo peggiorare l'esito, mai
    // migliorarlo, quindi la sua assenza non può capovolgere un giudizio —
    // al più lo lascia più mite del vero. Contarla fra le lacune bloccanti
    // mandava in rosso aziende che rosse non erano: su uno strumento di
    // triage significa restituire sempre lo stesso rosso, cioè rumore.
    const a = calcolaAttenzione({ ...completo, coloreQualitativo: null });
    expect(a.esito).toBe('ATTENZIONE_MINIMA');
    // E NON viene nemmeno elencato: la Check List si compila dopo, dirlo a
    // chi ha appena caricato i documenti è un'ovvietà che distrae dalle
    // lacune che contano. Concorre solo alla copertura.
    expect(a.daAccertare.some((d) => d.includes('qualitativo'))).toBe(false);
    expect(a.copertura.determinate).toBeLessThan(a.copertura.totali);
  });

  it('le lacune PORTANTI invece bloccano: soglie o bilancio', () => {
    expect(calcolaAttenzione({ ...completo, sogliaSuperata: null }).etichetta).toBe(
      'Approfondimenti necessari'
    );
    expect(
      calcolaAttenzione({
        ...completo,
        annoCostituzione: 2005,
        xbrlPresente: false,
        patrimonioNetto: null,
        indiciViolati: null,
      }).etichetta
    ).toBe('Approfondimenti necessari');
  });

  it('soglia superata + quadro qualitativo assente: il qualitativo non si elenca', () => {
    const a = calcolaAttenzione({
      ...completo,
      sogliaSuperata: true,
      coloreQualitativo: null,
      ritardoOltre90Giorni: true, // accertato: non produce lacune
    });
    expect(a.etichetta).toBe('Criticità rilevante');
    expect(a.daAccertare).toHaveLength(0);
  });

  it('col ritardo NON accertato, la lacuna compare — ed è una lacuna vera', () => {
    // Il requisito esiste e non è stato verificato: dirlo è diverso dal
    // segnalare che manca la Check List, che non cambierebbe il giudizio.
    const a = calcolaAttenzione({ ...completo, sogliaSuperata: true, coloreQualitativo: null });
    expect(a.daAccertare.join(' ')).toContain('Elenco Deleghe');
    expect(a.daAccertare.join(' ')).not.toContain('qualitativo');
  });

  it('patrimonio negativo + lacuna PORTANTE: l’etichetta le dice insieme', () => {
    const a = calcolaAttenzione({ ...completo, patrimonioNetto: -1, sogliaSuperata: null });
    expect(a.etichetta).toBe('Criticità rilevante che potrebbe richiedere approfondimenti');
  });
});

describe('anno di costituzione e assenza di bilancio', () => {
  it('impresa giovane con esposizione sotto soglia: l’assenza è giustificata', () => {
    const a = calcolaAttenzione({
      ...completo,
      annoCostituzione: 2026 - ANNI_GIOVANE_IMPRESA,
      xbrlPresente: false,
      patrimonioNetto: null,
      indiciViolati: null,
      esposizione: 1_000,
      sogliaApplicabile: 5_000,
    });
    expect(a.esito).not.toBe('ROSSO');
    expect(a.daAccertare.some((d) => d.includes('XBRL'))).toBe(false);
  });

  it('impresa giovane MA oltre la soglia: la giovane età non è una scusante', () => {
    const a = calcolaAttenzione({
      ...completo,
      annoCostituzione: 2026 - ANNI_GIOVANE_IMPRESA,
      xbrlPresente: false,
      patrimonioNetto: null,
      indiciViolati: null,
      esposizione: 90_000,
      sogliaApplicabile: 5_000,
    });
    expect(a.esito).toBe('ROSSO');
    expect(a.accertato.join(' ')).toContain('non spiega');
  });

  it('impresa NON giovane senza bilancio: mancato deposito, è un segnale', () => {
    const a = calcolaAttenzione({
      ...completo,
      annoCostituzione: 2005,
      xbrlPresente: false,
      patrimonioNetto: null,
      indiciViolati: null,
    });
    expect(a.esito).toBe('ROSSO');
    expect(a.accertato.join(' ')).toContain('non giustifica il mancato deposito');
  });

  it('anno di costituzione non dichiarato: non si può distinguere, quindi si chiede', () => {
    const a = calcolaAttenzione({
      ...completo,
      annoCostituzione: null,
      xbrlPresente: false,
      patrimonioNetto: null,
      indiciViolati: null,
    });
    expect(a.esito).toBe('ROSSO');
    expect(a.daAccertare.some((d) => d.includes('Anno di costituzione'))).toBe(true);
  });
});

describe('vincoli giuridici ed equilibrio', () => {
  it('patrimonio netto negativo → ROSSO', () => {
    const a = calcolaAttenzione({ ...completo, patrimonioNetto: -1 });
    expect(a.esito).toBe('ROSSO');
    expect(a.fattoreDeterminante).toContain('Patrimonio netto');
  });

  it('tre indici violati → ROSSO, uno o due → GIALLO', () => {
    expect(calcolaAttenzione({ ...completo, indiciViolati: 3 }).esito).toBe('ROSSO');
    expect(calcolaAttenzione({ ...completo, indiciViolati: 2 }).esito).toBe('GIALLO');
    expect(calcolaAttenzione({ ...completo, indiciViolati: 1 }).esito).toBe('GIALLO');
  });
});

describe('l’esito migliore non è un verde pieno', () => {
  it('con tutto in ordine si dichiara comunque il limite del giudizio', () => {
    const a = calcolaAttenzione(completo);
    expect(a.esito).toBe('ATTENZIONE_MINIMA');
    expect(a.etichetta).toContain('con i dati disponibili');
  });

  it('il semaforo dice sempre PERCHÉ è acceso', () => {
    for (const caso of [
      completo,
      { ...completo, indiciViolati: 2 },
      { ...completo, sogliaSuperata: true },
      { ...completo, sogliaSuperata: null },
    ]) {
      expect(calcolaAttenzione(caso).fattoreDeterminante.length).toBeGreaterThan(0);
    }
  });

  it('la copertura informativa è sempre riportata', () => {
    const a = calcolaAttenzione(completo);
    expect(a.copertura).toEqual({ determinate: 4, totali: 4 });
    const b = calcolaAttenzione({ ...completo, sogliaSuperata: null, coloreQualitativo: null });
    expect(b.copertura.determinate).toBe(2);
  });
});

describe('i due registri coesistono senza gerarchia', () => {
  // Se con un fascicolo incompleto la comunicazione parta o si attenda
  // dipende dall'ufficio e dal dirigente. Il sistema non deve decidere al
  // posto loro: espone i fatti e le lacune, e lascia la scelta.

  it('fatto accertato e lacuna compaiono INSIEME, non uno al posto dell’altro', () => {
    const a = calcolaAttenzione({
      ...completo,
      patrimonioNetto: -1, // fatto accertato
      sogliaSuperata: null, // lacuna portante
    });
    expect(a.accertato.length).toBeGreaterThan(0);
    expect(a.daAccertare.length).toBeGreaterThan(0);
    expect(a.accertato.join(' ')).toContain('Patrimonio netto');
    expect(a.daAccertare.join(' ')).toContain('Soglie');
  });

  it('l’etichetta li dice insieme quando la lacuna è PORTANTE', () => {
    // Patrimonio negativo (fatto) + soglie non determinabili (lacuna
    // portante): entrambe le cose nella stessa etichetta.
    const a = calcolaAttenzione({ ...completo, patrimonioNetto: -1, sogliaSuperata: null });
    expect(a.etichetta).toBe('Criticità rilevante che potrebbe richiedere approfondimenti');
    expect(a.accertato.length).toBeGreaterThan(0);
    expect(a.daAccertare.length).toBeGreaterThan(0);
  });

  it('con il quadro completo l’etichetta resta secca', () => {
    // "Potrebbe richiedere approfondimenti" sarebbe fuorviante: non c'è
    // nulla da approfondire.
    const a = calcolaAttenzione({ ...completo, sogliaSuperata: true });
    expect(a.etichetta).toBe('Criticità rilevante');
  });

  it('l’indicatore non prescrive MAI un ordine di azioni', () => {
    for (const caso of [
      { ...completo, sogliaSuperata: true, coloreQualitativo: null },
      { ...completo, sogliaSuperata: null },
      { ...completo, patrimonioNetto: -1, coloreQualitativo: null },
    ]) {
      const a = calcolaAttenzione(caso);
      const testo = [a.etichetta, ...a.accertato, ...a.daAccertare].join(' ').toLowerCase();
      // Nessun imperativo procedurale: non si dice al valutatore cosa fare
      // per primo, perché la prassi non è univoca nell'ente.
      expect(testo).not.toMatch(/prima di|occorre richiedere|si deve attendere|procedere con/);
    }
  });
});

describe('il semaforo dice QUALE soglia, non "almeno una"', () => {
  it('riporta il dettaglio quando c’è', () => {
    // "Almeno una soglia risulta superata" è vero e inutile: obbliga il
    // valutatore a cercare altrove quale e con quali numeri — e un dato che
    // costringe a cercarlo altrove è un dato che non abbiamo dato.
    const a = calcolaAttenzione({
      ...completo,
      sogliaSuperata: true,
      dettaglioSoglieSuperate: [
        'INPS — soglia > 30% dei dovuti e > 15.000 €. Contributi 496.544 € oltre entrambe.',
      ],
    });
    expect(a.accertato[0]).toContain('496.544');
    expect(a.accertato[0]).not.toContain('Almeno una');
  });

  it('senza dettaglio si torna alla frase generica, non si tace', () => {
    const a = calcolaAttenzione({ ...completo, sogliaSuperata: true });
    expect(a.accertato[0]).toContain('Almeno una soglia');
  });

  it('il ritardo accertato compare fra gli elementi ACCERTATI', () => {
    const a = calcolaAttenzione({
      ...completo,
      sogliaSuperata: true,
      ritardoOltre90Giorni: true,
      periodiInRitardo: 44,
    });
    expect(a.accertato.join(' ')).toContain('44 periodi');
  });

  it('il ritardo non accertato resta fra le cose DA ACCERTARE', () => {
    const a = calcolaAttenzione({
      ...completo,
      sogliaSuperata: true,
      ritardoOltre90Giorni: null,
    });
    expect(a.daAccertare.join(' ')).toContain('Elenco Deleghe');
  });

  it('un ritardo accertato ASSENTE non viene né vantato né lamentato', () => {
    // false = accertato e non presente: non è una lacuna, e non è un
    // elemento a carico. Non deve comparire da nessuna delle due parti.
    const a = calcolaAttenzione({
      ...completo,
      sogliaSuperata: true,
      ritardoOltre90Giorni: false,
    });
    expect(a.accertato.join(' ')).not.toContain('Ritardo di oltre 90');
    expect(a.daAccertare.join(' ')).not.toContain('Elenco Deleghe');
  });
});
