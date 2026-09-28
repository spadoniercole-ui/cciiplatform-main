import { describe, it, expect } from 'vitest';
import { calcolaPesiDirettrici, calcolaQuadroDirettrici } from './scoringDirettrici';
import type { SezioneChecklist } from './ministeriale';
import type { RispostaPerCalcolo } from './scoring';

function sezione(numero: string, numeroDomande: number): SezioneChecklist {
  return {
    numero,
    titolo: `Sezione ${numero}`,
    domande: Array.from({ length: numeroDomande }, (_, i) => ({
      id: `${numero}.${i + 1}`,
      aCuraDi: 'esperto' as const,
      peso: 'RILEVANTE' as const,
      domanda: `Domanda ${numero}.${i + 1}`,
    })),
  };
}

function risposte(valori: Record<string, boolean | null>): Record<string, RispostaPerCalcolo> {
  return Object.fromEntries(
    Object.entries(valori).map(([id, risposta]) => [id, { domandaId: id, risposta }])
  );
}

const somma = (pesi: Record<string, number>) => Object.values(pesi).reduce((a, b) => a + b, 0);

const direttrici = [
  { nome: 'Fiscale', prodotti: ['IVA', 'IRES', 'IRAP'] },
  { nome: 'Contributiva', prodotti: ['INPS'] },
];

describe('calcolaPesiDirettrici', () => {
  it('ripartisce 100 punti in proporzione ai prodotti e poi per domanda', () => {
    const { pesiPerDomanda, pesiPerDirettrice } = calcolaPesiDirettrici(
      [sezione('1', 3), sezione('2', 2)],
      direttrici
    );
    expect(pesiPerDirettrice).toEqual([
      { nome: 'Fiscale', prodotti: 3, peso: 75 },
      { nome: 'Contributiva', prodotti: 1, peso: 25 },
    ]);
    expect(pesiPerDomanda['1.1']).toBeCloseTo(25, 10);
    expect(pesiPerDomanda['2.2']).toBeCloseTo(12.5, 10);
    expect(somma(pesiPerDomanda)).toBeCloseTo(100, 10);
  });

  it('la somma dei pesi resta 100 anche con quote periodiche', () => {
    const { pesiPerDomanda } = calcolaPesiDirettrici(
      [sezione('1', 7), sezione('2', 3), sezione('3', 1)],
      [
        { nome: 'A', prodotti: ['a'] },
        { nome: 'B', prodotti: ['b'] },
        { nome: 'C', prodotti: ['c'] },
      ]
    );
    expect(somma(pesiPerDomanda)).toBeCloseTo(100, 10);
  });

  it('nessun prodotto configurato → nessun peso', () => {
    expect(calcolaPesiDirettrici([sezione('1', 2)], [{ nome: 'Vuota', prodotti: [] }])).toEqual({
      pesiPerDomanda: {},
      pesiPerDirettrice: [],
    });
    expect(calcolaPesiDirettrici([sezione('1', 2)], [])).toEqual({
      pesiPerDomanda: {},
      pesiPerDirettrice: [],
    });
  });

  it('le sezioni in più rispetto alle direttrici hanno peso 0 e usano il titolo', () => {
    const { pesiPerDomanda, pesiPerDirettrice } = calcolaPesiDirettrici(
      [sezione('1', 1), sezione('2', 1)],
      [{ nome: 'Unica', prodotti: ['x'] }]
    );
    expect(pesiPerDirettrice[1]).toEqual({ nome: 'Sezione 2', prodotti: 0, peso: 0 });
    expect(pesiPerDomanda['2.1']).toBe(0);
    expect(pesiPerDomanda['1.1']).toBe(100);
  });

  it('una sezione senza domande compare nei pesi per direttrice ma non assegna pesi', () => {
    const { pesiPerDomanda, pesiPerDirettrice } = calcolaPesiDirettrici(
      [sezione('1', 0), sezione('2', 2)],
      direttrici
    );
    expect(pesiPerDirettrice.map((d) => d.peso)).toEqual([75, 25]);
    expect(Object.keys(pesiPerDomanda)).toEqual(['2.1', '2.2']);
  });

  it.todo(
    'sezione senza domande: il peso della sua direttrice va perso e non viene ridistribuito ' +
      '(sezioni [0 domande, 2 domande], prodotti [3, 1] → somma pesi 25 invece di 100)'
  );
  it.todo(
    'meno sezioni generate che direttrici: i prodotti delle direttrici senza sezione restano ' +
      'nel denominatore (1 sezione, direttrici [3, 1] prodotti → somma pesi 75 invece di 100)'
  );
});

describe('calcolaQuadroDirettrici', () => {
  const sezioni = [sezione('1', 3), sezione('2', 2)];

  it('nessuna risposta (tutte N/A) → punteggio null, etichetta grigia', () => {
    const q = calcolaQuadroDirettrici(
      sezioni,
      direttrici,
      risposte({ '1.1': null, '1.2': null, '1.3': null, '2.1': null, '2.2': null })
    );
    expect(q.punteggio).toBeNull();
    expect(q.domandeRisposte).toBe(0);
    expect(q.domandeTotali).toBe(5);
    expect(q.coloreEtichetta).toBe('grigio');
    expect(q.etichetta).toBe('Non ancora valutabile');
  });

  it('tutte No → +100, criticità rilevanti', () => {
    const q = calcolaQuadroDirettrici(
      sezioni,
      direttrici,
      risposte({ '1.1': false, '1.2': false, '1.3': false, '2.1': false, '2.2': false })
    );
    expect(q.punteggio).toBeCloseTo(100, 10);
    expect(q.coloreEtichetta).toBe('rosso');
  });

  it('tutte Sì → -100, nessuna criticità netta', () => {
    const q = calcolaQuadroDirettrici(
      sezioni,
      direttrici,
      risposte({ '1.1': true, '1.2': true, '1.3': true, '2.1': true, '2.2': true })
    );
    expect(q.punteggio).toBeCloseTo(-100, 10);
    expect(q.coloreEtichetta).toBe('verde');
  });

  it('i No sommano e i Sì sottraggono; le domande senza risposta non contano', () => {
    // 1.1 No (+25), 2.1 Sì (-12.5), resto non risposto
    const q = calcolaQuadroDirettrici(sezioni, direttrici, risposte({ '1.1': false, '2.1': true }));
    expect(q.punteggio).toBeCloseTo(12.5, 10);
    expect(q.domandeRisposte).toBe(2);
    expect(q.coloreEtichetta).toBe('giallo');
    expect(q.etichetta).toBe('Da approfondire');
  });

  describe('soglie dell’etichetta (0 e 30 inclusi)', () => {
    // Una sezione, una direttrice con 10 prodotti, 10 domande → 10 punti a domanda.
    const s10 = [sezione('1', 10)];
    const d10 = [{ nome: 'D', prodotti: Array.from({ length: 10 }, (_, i) => `p${i}`) }];
    const conNo = (no: number, si: number) => {
      const v: Record<string, boolean> = {};
      for (let i = 1; i <= no; i++) v[`1.${i}`] = false;
      for (let i = no + 1; i <= no + si; i++) v[`1.${i}`] = true;
      return calcolaQuadroDirettrici(s10, d10, risposte(v));
    };

    it('punteggio esattamente 0 → verde', () => {
      const q = conNo(1, 1);
      expect(q.punteggio).toBe(0);
      expect(q.coloreEtichetta).toBe('verde');
    });

    it('punteggio esattamente 30 → giallo', () => {
      const q = conNo(3, 0);
      expect(q.punteggio).toBe(30);
      expect(q.coloreEtichetta).toBe('giallo');
    });

    it('punteggio 40 → rosso', () => {
      const q = conNo(4, 0);
      expect(q.punteggio).toBe(40);
      expect(q.coloreEtichetta).toBe('rosso');
    });
  });

  it('nessuna sezione → punteggio null e zero domande', () => {
    const q = calcolaQuadroDirettrici([], direttrici, {});
    expect(q.punteggio).toBeNull();
    expect(q.domandeTotali).toBe(0);
    expect(q.pesiPerDirettrice).toEqual([]);
  });

  it.todo(
    'tutte le risposte su domande a peso 0 (sezione senza direttrice): punteggio 0 → ' +
      '"Nessuna criticità netta rilevata" (verde) anche con tutti No; valutare "grigio"'
  );
});
