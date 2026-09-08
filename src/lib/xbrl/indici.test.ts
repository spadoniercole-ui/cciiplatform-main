import { describe, it, expect } from 'vitest';
import { calcolaIndiciCcii, calcolaSeverity, calcolaAltriIndici } from './indici';
import type { DatiFinanziariPeriodo } from './types';

/** Bilancio "vuoto": tutti i campi a zero, si sovrascrivono solo quelli rilevanti al test. */
function bilancio(overrides: Partial<DatiFinanziariPeriodo>): DatiFinanziariPeriodo {
  return {
    ricaviVendite: 0,
    valoreProduzione: 0,
    costiProduzione: 0,
    ebit: 0,
    ammortamenti: 0,
    ebitda: 0,
    oneriFinanziari: 0,
    utileEsercizio: 0,
    totaleAttivo: 0,
    attivoCircolante: 0,
    disponibilitaLiquide: 0,
    immobilizzazioni: 0,
    patrimonioNetto: 0,
    totaleDebiti: 0,
    debitiBanche: 0,
    debitiFornitori: 0,
    debitiTributari: 0,
    debitiPrevidenziali: 0,
    passivoCorrente: 0,
    creditiClienti: 0,
    ...overrides,
  };
}

describe('calcolaIndiciCcii', () => {
  it('azienda sana: tutti gli indici entro soglia', () => {
    const dati = bilancio({
      totaleDebiti: 100,
      ricaviVendite: 1000,
      patrimonioNetto: 50,
      disponibilitaLiquide: 100,
      valoreProduzione: 1000,
      oneriFinanziari: 50,
      debitiTributari: 10,
      debitiPrevidenziali: 5,
    });

    const indici = calcolaIndiciCcii(dati);
    const trovaIndice = (codice: string) => indici.find((i) => i.codice === codice)!;

    expect(trovaIndice('C1').valore).toBeCloseTo(0.1);
    expect(trovaIndice('C1').esito).toBe('OK');

    expect(trovaIndice('C2').valore).toBeCloseTo(0.5);
    expect(trovaIndice('C2').esito).toBe('OK');

    expect(trovaIndice('C3').valore).toBeCloseTo(0.1);
    expect(trovaIndice('C3').esito).toBe('OK');

    expect(trovaIndice('C4').valore).toBeCloseTo(20);
    expect(trovaIndice('C4').esito).toBe('OK');

    expect(trovaIndice('C5').valore).toBeCloseTo(0.15);
    expect(trovaIndice('C5').esito).toBe('OK');

    expect(calcolaSeverity(indici, dati.patrimonioNetto)).toBe('GREEN');
  });

  it('azienda in crisi: tutti gli indici violati e patrimonio netto negativo', () => {
    const dati = bilancio({
      totaleDebiti: 900,
      ricaviVendite: 1000,
      patrimonioNetto: -50,
      disponibilitaLiquide: 5,
      valoreProduzione: 1000,
      oneriFinanziari: 600,
      debitiTributari: 400,
      debitiPrevidenziali: 100,
    });

    const indici = calcolaIndiciCcii(dati);
    const trovaIndice = (codice: string) => indici.find((i) => i.codice === codice)!;

    expect(trovaIndice('C1').esito).toBe('VIOLATO'); // 0.9 >= 0.80
    expect(trovaIndice('C2').esito).toBe('VIOLATO'); // patrimonio netto negativo
    expect(trovaIndice('C3').esito).toBe('VIOLATO'); // 0.005 <= 0.02
    expect(trovaIndice('C4').esito).toBe('VIOLATO'); // 1.67 <= 2.00
    expect(trovaIndice('C5').esito).toBe('VIOLATO'); // 0.55 >= 0.30

    // Patrimonio netto negativo -> RED indipendentemente dal numero di indici violati
    expect(calcolaSeverity(indici, dati.patrimonioNetto)).toBe('RED');
  });

  it('denominatore a zero -> indice NON_CALCOLABILE, non un crash o un falso OK', () => {
    const dati = bilancio({
      totaleDebiti: 100,
      ricaviVendite: 0, // denominatore di C1 e C3
      oneriFinanziari: 0, // denominatore di C4
      patrimonioNetto: 10,
    });

    const indici = calcolaIndiciCcii(dati);
    const trovaIndice = (codice: string) => indici.find((i) => i.codice === codice)!;

    expect(trovaIndice('C1').esito).toBe('NON_CALCOLABILE');
    expect(trovaIndice('C1').valore).toBe('N/D');
    expect(trovaIndice('C3').esito).toBe('NON_CALCOLABILE');
    expect(trovaIndice('C4').esito).toBe('NON_CALCOLABILE');
  });

  it('severity GREEN solo se patrimonio netto positivo e zero indici violati', () => {
    const nessunIndiceViolato = calcolaIndiciCcii(
      bilancio({
        totaleDebiti: 10,
        ricaviVendite: 1000,
        patrimonioNetto: 500,
        disponibilitaLiquide: 100,
        valoreProduzione: 1000,
        oneriFinanziari: 10,
      })
    );
    expect(calcolaSeverity(nessunIndiceViolato, 500)).toBe('GREEN');
  });

  it('severity YELLOW se patrimonio netto positivo ma 1-2 indici violati', () => {
    const dati = bilancio({
      totaleDebiti: 850, // C1 violato: 0.85 >= 0.80
      ricaviVendite: 1000,
      patrimonioNetto: 200, // positivo -> step1 superato
      disponibilitaLiquide: 100,
      valoreProduzione: 1000,
      oneriFinanziari: 10,
    });
    const indici = calcolaIndiciCcii(dati);
    expect(calcolaSeverity(indici, dati.patrimonioNetto)).toBe('YELLOW');
  });
});

describe('calcolaAltriIndici', () => {
  it('calcola ROE, ROI, rotazione attivo e incidenza indebitamento', () => {
    const dati = bilancio({
      utileEsercizio: 100,
      patrimonioNetto: 1000,
      ebit: 150,
      totaleAttivo: 2000,
      ricaviVendite: 3000,
      totaleDebiti: 800,
    });

    const altri = calcolaAltriIndici(dati);
    const trova = (codice: string) => altri.find((i) => i.codice === codice)!;

    expect(trova('ROE').valore).toBeCloseTo(0.1); // 100/1000
    expect(trova('ROI').valore).toBeCloseTo(0.075); // 150/2000
    expect(trova('ROT-ATT').valore).toBeCloseTo(1.5); // 3000/2000
    expect(trova('INC-DEB').valore).toBeCloseTo(0.4); // 800/2000
    expect(trova('INC-DEB').esito).toBe('OK'); // 0.4 < 0.70
  });
});
