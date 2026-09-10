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

  it('quadro qualitativo non compilato → approfondimenti necessari', () => {
    const a = calcolaAttenzione({ ...completo, coloreQualitativo: null });
    expect(a.esito).toBe('ROSSO');
    expect(a.etichetta).toBe('Approfondimenti necessari');
  });

  it('un fatto accertato prevale su "servono approfondimenti"', () => {
    // Soglia superata E dati mancanti: si dichiara la soglia, che è certa,
    // non la mancanza di dati.
    const a = calcolaAttenzione({ ...completo, sogliaSuperata: true, coloreQualitativo: null });
    expect(a.etichetta).toBe('Criticità rilevante che potrebbe richiedere approfondimenti');
    expect(a.daAccertare.length).toBeGreaterThan(0); // dichiarati comunque
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
      sogliaSuperata: true, // fatto
      coloreQualitativo: null, // lacuna
    });
    expect(a.accertato.length).toBeGreaterThan(0);
    expect(a.daAccertare.length).toBeGreaterThan(0);
    expect(a.accertato.join(' ')).toContain('soglia');
    expect(a.daAccertare.join(' ')).toContain('qualitativo');
  });

  it('l’etichetta li dice insieme quando ci sono entrambi', () => {
    const a = calcolaAttenzione({ ...completo, sogliaSuperata: true, coloreQualitativo: null });
    expect(a.etichetta).toBe('Criticità rilevante che potrebbe richiedere approfondimenti');
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
