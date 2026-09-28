import { describe, it, expect } from 'vitest';
import {
  calcolaIndiciCcii,
  calcolaSeverity,
  calcolaAltriIndici,
  costruisciBundleIndici,
} from './indici';
import type { DatiFinanziariPeriodo, IndiceCcii } from './types';

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

/** Restituisce l'indice CCII con il codice dato, calcolato sul bilancio passato. */
function indiceCcii(dati: DatiFinanziariPeriodo, codice: string): IndiceCcii {
  const trovato = calcolaIndiciCcii(dati).find((i) => i.codice === codice);
  if (!trovato) throw new Error(`Indice ${codice} non trovato`);
  return trovato;
}

/** Indice sintetico con un dato esito, per testare calcolaSeverity in isolamento. */
function indiceConEsito(codice: string, esito: IndiceCcii['esito']): IndiceCcii {
  return {
    codice,
    nome: codice,
    valore: esito === 'NON_CALCOLABILE' ? 'N/D' : 0,
    soglia: '-',
    esito,
  };
}

/** Bilancio di base in cui tutti e 5 gli indici CCII sono entro soglia. */
const BASE_SANA: Partial<DatiFinanziariPeriodo> = {
  totaleDebiti: 1000,
  ricaviVendite: 10000, // C1 = 0.10
  patrimonioNetto: 500, // C2 = 0.50
  disponibilitaLiquide: 1000, // C3 = 0.10
  valoreProduzione: 10000,
  oneriFinanziari: 100, // C4 = 100
  debitiTributari: 50,
  debitiPrevidenziali: 50, // C5 = 0.10
};

describe('calcolaIndiciCcii — struttura del risultato', () => {
  it("restituisce sempre i 5 indici C1..C5 nell'ordine, con le soglie dichiarate", () => {
    const indici = calcolaIndiciCcii(bilancio(BASE_SANA));
    expect(indici.map((i) => i.codice)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
    expect(indici.map((i) => i.soglia)).toEqual(['< 0.80', '> 0.10', '> 0.02', '> 2.00', '< 0.30']);
  });

  it('il valore esposto è arrotondato a 2 decimali', () => {
    const c1 = indiceCcii(
      bilancio({ ...BASE_SANA, totaleDebiti: 1234, ricaviVendite: 10000 }),
      'C1'
    );
    expect(c1.valore).toBe(0.12); // 0.1234 -> 0.12
  });

  it('C5 somma debiti tributari e previdenziali al numeratore', () => {
    const c5 = indiceCcii(
      bilancio({
        ...BASE_SANA,
        totaleDebiti: 1000,
        debitiTributari: 150,
        debitiPrevidenziali: 100,
      }),
      'C5'
    );
    expect(c5.valore).toBe(0.25);
    expect(c5.esito).toBe('OK');
  });
});

describe('calcolaIndiciCcii — soglie al limite (confronto stretto)', () => {
  // Le soglie sono dichiarate con operatori stretti ("< 0.80", "> 0.10", ...):
  // il valore esattamente pari alla soglia è quindi VIOLATO.

  it('C1: 0.79 OK, 0.80 esatto VIOLATO, 0.81 VIOLATO', () => {
    const c1 = (debiti: number) =>
      indiceCcii(bilancio({ ...BASE_SANA, totaleDebiti: debiti, ricaviVendite: 100 }), 'C1');
    expect(c1(79).esito).toBe('OK');
    expect(c1(80).valore).toBe(0.8);
    expect(c1(80).esito).toBe('VIOLATO');
    expect(c1(81).esito).toBe('VIOLATO');
  });

  it('C2: 0.09 VIOLATO, 0.10 esatto VIOLATO, 0.11 OK', () => {
    const c2 = (pn: number) =>
      indiceCcii(bilancio({ ...BASE_SANA, patrimonioNetto: pn, totaleDebiti: 100 }), 'C2');
    expect(c2(9).esito).toBe('VIOLATO');
    expect(c2(10).valore).toBe(0.1);
    expect(c2(10).esito).toBe('VIOLATO');
    expect(c2(11).esito).toBe('OK');
  });

  it('C3: 0.01 VIOLATO, 0.02 esatto VIOLATO, 0.03 OK', () => {
    const c3 = (liquidita: number) =>
      indiceCcii(
        bilancio({ ...BASE_SANA, disponibilitaLiquide: liquidita, ricaviVendite: 100 }),
        'C3'
      );
    expect(c3(1).esito).toBe('VIOLATO');
    expect(c3(2).valore).toBe(0.02);
    expect(c3(2).esito).toBe('VIOLATO');
    expect(c3(3).esito).toBe('OK');
  });

  it('C4: 1.99 VIOLATO, 2.00 esatto VIOLATO, 2.01 OK', () => {
    const c4 = (vp: number) =>
      indiceCcii(bilancio({ ...BASE_SANA, valoreProduzione: vp, oneriFinanziari: 100 }), 'C4');
    expect(c4(199).esito).toBe('VIOLATO');
    expect(c4(200).valore).toBe(2);
    expect(c4(200).esito).toBe('VIOLATO');
    expect(c4(201).esito).toBe('OK');
  });

  it('C5: 0.29 OK, 0.30 esatto VIOLATO, 0.31 VIOLATO', () => {
    const c5 = (tributari: number) =>
      indiceCcii(
        bilancio({
          ...BASE_SANA,
          totaleDebiti: 100,
          debitiTributari: tributari,
          debitiPrevidenziali: 0,
        }),
        'C5'
      );
    expect(c5(29).esito).toBe('OK');
    expect(c5(30).valore).toBe(0.3);
    expect(c5(30).esito).toBe('VIOLATO');
    expect(c5(31).esito).toBe('VIOLATO');
  });
});

describe('calcolaIndiciCcii — arrotondamento e soglie', () => {
  // L'arrotondamento a 2 decimali (toFixed(2)) avviene PRIMA del confronto con la
  // soglia. Quando il valore grezzo è già oltre soglia, l'arrotondamento non cambia
  // il verdetto: questi casi sono coerenti con qualunque interpretazione.

  it('valori grezzi già oltre soglia restano VIOLATO anche dopo arrotondamento', () => {
    // C1 grezzo 0.8049 (>= 0.80) -> 0.80 -> VIOLATO
    expect(
      indiceCcii(bilancio({ ...BASE_SANA, totaleDebiti: 8049, ricaviVendite: 10000 }), 'C1').esito
    ).toBe('VIOLATO');
    // C2 grezzo 0.0951 (<= 0.10) -> 0.10 -> VIOLATO
    expect(
      indiceCcii(bilancio({ ...BASE_SANA, patrimonioNetto: 951, totaleDebiti: 10000 }), 'C2').esito
    ).toBe('VIOLATO');
    // C4 grezzo 1.996 (<= 2) -> 2.00 -> VIOLATO
    expect(
      indiceCcii(bilancio({ ...BASE_SANA, valoreProduzione: 1996, oneriFinanziari: 1000 }), 'C4')
        .esito
    ).toBe('VIOLATO');
  });

  it('valori grezzi entro soglia che arrotondano restando entro soglia sono OK', () => {
    // C1 grezzo 0.7949 -> 0.79 -> OK
    expect(
      indiceCcii(bilancio({ ...BASE_SANA, totaleDebiti: 7949, ricaviVendite: 10000 }), 'C1').esito
    ).toBe('OK');
    // C5 grezzo 0.2949 -> 0.29 -> OK
    expect(
      indiceCcii(
        bilancio({
          ...BASE_SANA,
          totaleDebiti: 10000,
          debitiTributari: 2949,
          debitiPrevidenziali: 0,
        }),
        'C5'
      ).esito
    ).toBe('OK');
  });

  // Casi in cui l'arrotondamento prima del confronto RIBALTA il verdetto: da validare.
  it.todo(
    'C1: debiti/ricavi grezzo 0.7951 (< 0.80) arrotondato a 0.80 risulta VIOLATO — il confronto andrebbe fatto sul valore non arrotondato?'
  );
  it.todo('C2: PN/debiti grezzo 0.1049 (> 0.10) arrotondato a 0.10 risulta VIOLATO — da validare');
  it.todo(
    'C3: liquidità/ricavi grezzo 0.0249 (> 0.02) arrotondato a 0.02 risulta VIOLATO — da validare'
  );
  it.todo(
    'C4: valore produzione/oneri grezzo 2.004 (> 2) arrotondato a 2.00 risulta VIOLATO — da validare'
  );
  it.todo(
    'C5: tributari+previdenziali/debiti grezzo 0.2951 (< 0.30) arrotondato a 0.30 risulta VIOLATO — da validare'
  );
});

describe('calcolaIndiciCcii — patrimonio netto nullo o negativo', () => {
  it('patrimonio netto = 0: C2 vale 0 ed è VIOLATO', () => {
    const c2 = indiceCcii(bilancio({ ...BASE_SANA, patrimonioNetto: 0 }), 'C2');
    expect(c2.valore).toBe(0);
    expect(c2.esito).toBe('VIOLATO');
  });

  it('patrimonio netto negativo: C2 negativo e VIOLATO', () => {
    const c2 = indiceCcii(
      bilancio({ ...BASE_SANA, patrimonioNetto: -300, totaleDebiti: 1000 }),
      'C2'
    );
    expect(c2.valore).toBe(-0.3);
    expect(c2.esito).toBe('VIOLATO');
  });
});

describe('calcolaIndiciCcii — denominatori a zero, valori negativi, dati mancanti', () => {
  it('ricavi = 0: C1 e C3 NON_CALCOLABILE, gli altri indici restano calcolati', () => {
    const indici = calcolaIndiciCcii(bilancio({ ...BASE_SANA, ricaviVendite: 0 }));
    const esiti = Object.fromEntries(indici.map((i) => [i.codice, i.esito]));
    expect(esiti).toEqual({
      C1: 'NON_CALCOLABILE',
      C2: 'OK',
      C3: 'NON_CALCOLABILE',
      C4: 'OK',
      C5: 'OK',
    });
  });

  it('un indice NON_CALCOLABILE ha sempre valore "N/D"', () => {
    const indici = calcolaIndiciCcii(bilancio({}));
    for (const i of indici) {
      expect(i.esito).toBe('NON_CALCOLABILE');
      expect(i.valore).toBe('N/D');
    }
  });

  it('C4 con oneri finanziari = 0: oggi NON_CALCOLABILE (comportamento attuale)', () => {
    // Si documenta solo che non si genera Infinity né un crash; se il verdetto
    // corretto sia "non calcolabile" o "OK" è oggetto del todo sotto.
    const c4 = indiceCcii(bilancio({ ...BASE_SANA, oneriFinanziari: 0 }), 'C4');
    expect(c4.valore).toBe('N/D');
    expect(Number.isFinite(c4.valore)).toBe(false);
  });
  it.todo(
    'C4 con oneri finanziari = 0 e valore della produzione positivo: è il caso migliore (nessun onere da coprire), ma risulta NON_CALCOLABILE invece di OK — da validare'
  );
  it.todo(
    "totale debiti = 0: C2 (PN/debiti) e C5 risultano NON_CALCOLABILE anche se l'assenza di debiti è il caso migliore — da validare"
  );

  it('ricavi negativi: C3 con liquidità positiva risulta negativo e VIOLATO', () => {
    const c3 = indiceCcii(
      bilancio({ ...BASE_SANA, ricaviVendite: -1000, disponibilitaLiquide: 100 }),
      'C3'
    );
    expect(c3.valore).toBe(-0.1);
    expect(c3.esito).toBe('VIOLATO');
  });
  it.todo(
    'ricavi negativi: C1 (debiti/ricavi) diventa negativo e quindi "< 0.80" → OK, un falso positivo di sostenibilità — andrebbe NON_CALCOLABILE o VIOLATO?'
  );

  it('valore della produzione negativo: C4 negativo e VIOLATO', () => {
    const c4 = indiceCcii(
      bilancio({ ...BASE_SANA, valoreProduzione: -500, oneriFinanziari: 100 }),
      'C4'
    );
    expect(c4.valore).toBe(-5);
    expect(c4.esito).toBe('VIOLATO');
  });

  it('campi NaN o mancanti non fanno lanciare eccezioni', () => {
    const conNaN = bilancio({ ...BASE_SANA, ricaviVendite: Number.NaN });
    expect(() => calcolaIndiciCcii(conNaN)).not.toThrow();
    const senzaCampo = { ...bilancio(BASE_SANA) } as Partial<DatiFinanziariPeriodo>;
    delete senzaCampo.oneriFinanziari;
    expect(() => calcolaIndiciCcii(senzaCampo as DatiFinanziariPeriodo)).not.toThrow();
  });
  it.todo(
    "campo NaN/undefined (es. ricaviVendite = NaN, oneriFinanziari assente): l'indice risulta VIOLATO con valore NaN invece di NON_CALCOLABILE — un dato mancante non dovrebbe contare come violazione"
  );
});

describe('calcolaSeverity — regole del semaforo', () => {
  const ok = (n: number) => Array.from({ length: n }, (_, k) => indiceConEsito(`OK${k}`, 'OK'));
  const violati = (n: number) =>
    Array.from({ length: n }, (_, k) => indiceConEsito(`V${k}`, 'VIOLATO'));

  it('PN positivo e 0 violati -> GREEN', () => {
    expect(calcolaSeverity(ok(5), 1)).toBe('GREEN');
  });

  it('PN positivo e 1 violato -> YELLOW', () => {
    expect(calcolaSeverity([...violati(1), ...ok(4)], 1)).toBe('YELLOW');
  });

  it('PN positivo ed esattamente 2 violati -> YELLOW', () => {
    expect(calcolaSeverity([...violati(2), ...ok(3)], 1)).toBe('YELLOW');
  });

  it('PN positivo ed esattamente 3 violati -> RED', () => {
    expect(calcolaSeverity([...violati(3), ...ok(2)], 1)).toBe('RED');
  });

  it('PN positivo e 5 violati -> RED', () => {
    expect(calcolaSeverity(violati(5), 1)).toBe('RED');
  });

  it('PN = 0 -> RED anche con zero indici violati (step 1 richiede PN positivo)', () => {
    expect(calcolaSeverity(ok(5), 0)).toBe('RED');
  });

  it('PN negativo -> RED anche con zero indici violati', () => {
    expect(calcolaSeverity(ok(5), -0.01)).toBe('RED');
  });

  it('PN appena positivo (0.01) supera lo step 1', () => {
    expect(calcolaSeverity(ok(5), 0.01)).toBe('GREEN');
  });

  it('gli indici NON_CALCOLABILE non contano come violati', () => {
    const indici = [
      ...violati(2),
      indiceConEsito('N1', 'NON_CALCOLABILE'),
      indiceConEsito('N2', 'NON_CALCOLABILE'),
    ];
    expect(calcolaSeverity(indici, 1)).toBe('YELLOW');
  });
  it.todo(
    'tutti gli indici NON_CALCOLABILE (bilancio senza dati) con PN positivo danno GREEN: un semaforo verde senza alcun indice calcolato può essere fuorviante — da validare'
  );
  it.todo(
    'patrimonio netto NaN (dato mancante) dà RED come un PN negativo invece di segnalare dato non disponibile — da validare'
  );

  it('integrazione: 2 violazioni reali -> YELLOW, aggiungendone una terza -> RED', () => {
    // C1 violato (0.90) e C5 violato (0.50)
    const dueViolazioni = bilancio({
      ...BASE_SANA,
      totaleDebiti: 9000,
      ricaviVendite: 10000,
      patrimonioNetto: 5000,
      disponibilitaLiquide: 1000,
      debitiTributari: 4500,
      debitiPrevidenziali: 0,
    });
    const indici2 = calcolaIndiciCcii(dueViolazioni);
    expect(indici2.filter((i) => i.esito === 'VIOLATO').map((i) => i.codice)).toEqual(['C1', 'C5']);
    expect(calcolaSeverity(indici2, dueViolazioni.patrimonioNetto)).toBe('YELLOW');

    // + C3 violato (liquidità 0.01 sui ricavi)
    const treViolazioni = { ...dueViolazioni, disponibilitaLiquide: 100 };
    const indici3 = calcolaIndiciCcii(treViolazioni);
    expect(indici3.filter((i) => i.esito === 'VIOLATO').map((i) => i.codice)).toEqual([
      'C1',
      'C3',
      'C5',
    ]);
    expect(calcolaSeverity(indici3, treViolazioni.patrimonioNetto)).toBe('RED');
  });
});

describe('costruisciBundleIndici', () => {
  it('indici, altri indici e severity coincidono con le funzioni singole', () => {
    const casi: Partial<DatiFinanziariPeriodo>[] = [
      BASE_SANA,
      { ...BASE_SANA, totaleDebiti: 9000 }, // alcune violazioni
      { ...BASE_SANA, patrimonioNetto: -100 }, // PN negativo
      { ...BASE_SANA, patrimonioNetto: 0 }, // PN nullo
      {}, // tutto a zero
    ];
    for (const caso of casi) {
      const dati = bilancio(caso);
      const bundle = costruisciBundleIndici(dati);
      const indici = calcolaIndiciCcii(dati);
      expect(bundle.indici).toEqual(indici);
      expect(bundle.altriIndici).toEqual(calcolaAltriIndici(dati));
      expect(bundle.severity).toBe(calcolaSeverity(indici, dati.patrimonioNetto));
    }
  });

  it('situazione debitoria: altri debiti = totale meno le voci specifiche', () => {
    const { situazioneDebitoria } = costruisciBundleIndici(
      bilancio({
        totaleDebiti: 1000,
        debitiBanche: 400,
        debitiFornitori: 300,
        debitiTributari: 100,
        debitiPrevidenziali: 50,
        disponibilitaLiquide: 150,
      })
    );
    expect(situazioneDebitoria).toEqual({
      debitiBanche: 400,
      debitiFornitori: 300,
      debitiTributari: 100,
      debitiPrevidenziali: 50,
      altriDebiti: 150,
      totaleDebiti: 1000,
      disponibilitaLiquide: 150,
      pfn: 250, // 400 - 150
    });
  });

  it('altri debiti bloccati a 0 se le voci specifiche superano il totale debiti', () => {
    const { situazioneDebitoria } = costruisciBundleIndici(
      bilancio({
        totaleDebiti: 500,
        debitiBanche: 400,
        debitiFornitori: 300,
        debitiTributari: 100,
        debitiPrevidenziali: 50,
      })
    );
    expect(situazioneDebitoria.altriDebiti).toBe(0);
    // il totale non viene "corretto": resta quello di bilancio
    expect(situazioneDebitoria.totaleDebiti).toBe(500);
  });

  it('altri debiti = 0 quando le voci specifiche coincidono col totale', () => {
    const { situazioneDebitoria } = costruisciBundleIndici(
      bilancio({ totaleDebiti: 700, debitiBanche: 400, debitiFornitori: 300 })
    );
    expect(situazioneDebitoria.altriDebiti).toBe(0);
  });

  it('PFN negativa quando la liquidità supera i debiti verso banche', () => {
    const { situazioneDebitoria } = costruisciBundleIndici(
      bilancio({ debitiBanche: 200, disponibilitaLiquide: 500 })
    );
    expect(situazioneDebitoria.pfn).toBe(-300);
  });
});
