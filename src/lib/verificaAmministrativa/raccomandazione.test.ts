import { describe, expect, it } from 'vitest';
import { raccomandaDecisione, type IngressoRaccomandazione } from './raccomandazione';

const input = (p: Partial<IngressoRaccomandazione> = {}): IngressoRaccomandazione => ({
  esito: 'ROSSO',
  fattoreDeterminante: 'Soglia di segnalazione superata',
  copertura: { determinate: 4, totali: 4 },
  debitoEnte: 925_272,
  anniXbrl: 2,
  parametriPresenti: true,
  indiciViolati: 1,
  patrimonioNetto: 278_567,
  ...p,
});

describe('raccomandaDecisione', () => {
  it('senza bilanci la prima strada è la contabile, non la scelta fra accordo e liquidazione', () => {
    const esito = raccomandaDecisione(input({ anniXbrl: 0, indiciViolati: null }));

    expect(esito.direzione).toBe('CONTABILE');
    expect(esito.titolo).toMatch(/^Si consiglia di completare la verifica contabile/);
    expect(esito.motivi.join(' ')).toContain('Nessun bilancio XBRL');
  });

  it('con i bilanci ma senza parametri resta la contabile da completare', () => {
    const esito = raccomandaDecisione(input({ parametriPresenti: false }));

    expect(esito.direzione).toBe('CONTABILE');
    expect(esito.motivi.join(' ')).toContain('parametri dell’ente non sono compilati');
  });

  it('patrimonio netto negativo e tre indici oltre soglia: valutare la liquidazione', () => {
    const esito = raccomandaDecisione(input({ patrimonioNetto: -240_000, indiciViolati: 3 }));

    expect(esito.direzione).toBe('LIQUIDAZIONE');
    expect(esito.titolo).toMatch(/^Si consiglia di valutare la liquidazione giudiziale/);
    expect(esito.motivi.join(' ')).toContain('Patrimonio netto negativo');
  });

  it('patrimonio netto negativo con indici sotto la soglia grave: valutare il cram down', () => {
    const esito = raccomandaDecisione(input({ patrimonioNetto: -240_000, indiciViolati: 2 }));

    expect(esito.direzione).toBe('CRAM_DOWN');
    expect(esito.titolo).toMatch(/cram down/);
  });

  it('una sola criticità accertata porta a valutare l’accordo', () => {
    const esito = raccomandaDecisione(input({ esito: 'GIALLO', indiciViolati: 1 }));

    expect(esito.direzione).toBe('CRAM_DOWN');
  });

  it('senza criticità il percorso è ordinario, e il debito resta dichiarato', () => {
    const esito = raccomandaDecisione(
      input({ esito: 'ATTENZIONE_MINIMA', indiciViolati: 0, debitoEnte: 16_756 })
    );

    expect(esito.direzione).toBe('ORDINARIO');
    expect(esito.motivi.join(' ')).toContain('16.756 €');
  });

  it('dichiara sempre che non è una conclusione giuridica e perché il DSCR non c’è', () => {
    for (const caso of [
      input(),
      input({ anniXbrl: 0 }),
      input({ patrimonioNetto: -1, indiciViolati: 4 }),
      input({ esito: 'ATTENZIONE_MINIMA', indiciViolati: 0 }),
    ]) {
      const esito = raccomandaDecisione(caso);
      const limiti = esito.limiti.join(' ');
      expect(limiti).toContain('non una conclusione giuridica');
      expect(limiti).toContain('DSCR');
    }
  });

  it('se il debito non è memorizzato lo dice fra i limiti, invece di assumere zero', () => {
    const esito = raccomandaDecisione(input({ debitoEnte: null }));

    expect(esito.limiti.join(' ')).toContain('Nessun debito dell’ente memorizzato');
    expect(esito.motivi.join(' ')).not.toContain('0 €');
  });
});
