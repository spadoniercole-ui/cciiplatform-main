import { describe, expect, it } from 'vitest';
import { valutaSegnaliArt3 } from './segnali';

const riga = (lettera: 'a' | 'b' | 'c' | 'd') => {
  const r = valutaSegnaliArt3({}).righe.find((x) => x.lettera === lettera);
  if (!r) throw new Error(`riga ${lettera} assente`);
  return r;
};

describe('valutaSegnaliArt3 — dati mancanti', () => {
  it('senza dati non inventa né segnali né zeri', () => {
    const esito = valutaSegnaliArt3({});
    expect(esito.segnali).toBe(0);
    expect(esito.nonDeterminabili).toBe(4);
    expect(esito.sintesi).toContain('non verificabili');
    expect(esito.righe.every((r) => r.esito === 'non_determinabile')).toBe(true);
    expect(esito.righe.every((r) => r.fonteNecessaria !== null)).toBe(true);
  });

  it('dichiara la fonte che serve per ciascuna lettera', () => {
    expect(riga('a').fonteNecessaria).toContain('Libro paga');
    expect(riga('b').fonteNecessaria).toContain('Scadenzario fornitori');
    expect(riga('c').fonteNecessaria).toContain('Centrale dei rischi');
    expect(riga('d').fonteNecessaria).toContain('Soglie di segnalazione');
  });

  it('un dato parziale non chiude il confronto', () => {
    const esito = valutaSegnaliArt3({ retribuzioniScaduteOltre30: 80_000 });
    const a = esito.righe.find((r) => r.lettera === 'a')!;
    expect(a.esito).toBe('non_determinabile');
    expect(a.confronto).toContain('80.000');
  });
});

describe('valutaSegnaliArt3 — lettera a, retribuzioni', () => {
  const base = { retribuzioniMensiliTotali: 100_000 };

  it('oltre la metà è un segnale', () => {
    const a = valutaSegnaliArt3({ ...base, retribuzioniScaduteOltre30: 60_000 }).righe[0];
    expect(a.esito).toBe('segnale');
  });

  it('esattamente la metà non lo è: la norma dice «oltre»', () => {
    const a = valutaSegnaliArt3({ ...base, retribuzioniScaduteOltre30: 50_000 }).righe[0];
    expect(a.esito).toBe('sotto');
  });

  it('un monte retribuzioni nullo non si presta al calcolo', () => {
    const a = valutaSegnaliArt3({
      retribuzioniScaduteOltre30: 10_000,
      retribuzioniMensiliTotali: 0,
    }).righe[0];
    expect(a.esito).toBe('non_determinabile');
  });
});

describe('valutaSegnaliArt3 — lettera b, fornitori', () => {
  it('scaduti oltre 90 giorni superiori ai non scaduti: segnale', () => {
    const b = valutaSegnaliArt3({
      fornitoriScadutiOltre90: 70_000,
      fornitoriNonScaduti: 69_999,
    }).righe[1];
    expect(b.esito).toBe('segnale');
  });

  it('importi uguali non superano il confronto', () => {
    const b = valutaSegnaliArt3({
      fornitoriScadutiOltre90: 70_000,
      fornitoriNonScaduti: 70_000,
    }).righe[1];
    expect(b.esito).toBe('sotto');
  });
});

describe('valutaSegnaliArt3 — lettera c, banche', () => {
  it('il 5% esatto basta: la norma dice «almeno»', () => {
    const c = valutaSegnaliArt3({
      bancheScaduteOltre60: 5_000,
      bancheOltreAffidamentoOltre60: 0,
      bancheEsposizioniTotali: 100_000,
    }).righe[2];
    expect(c.esito).toBe('segnale');
  });

  it('sotto il 5% non è un segnale', () => {
    const c = valutaSegnaliArt3({
      bancheScaduteOltre60: 4_999,
      bancheOltreAffidamentoOltre60: 0,
      bancheEsposizioniTotali: 100_000,
    }).righe[2];
    expect(c.esito).toBe('sotto');
  });

  it('somma scaduto e superamento dell’affidamento, come dice la lettera', () => {
    const c = valutaSegnaliArt3({
      bancheScaduteOltre60: 2_000,
      bancheOltreAffidamentoOltre60: 3_000,
      bancheEsposizioniTotali: 100_000,
    }).righe[2];
    expect(c.esito).toBe('segnale');
  });
});

describe('valutaSegnaliArt3 — lettera d, rinvio all’art. 25-novies', () => {
  it('zero superamenti non equivale a confronto non eseguito', () => {
    const conZero = valutaSegnaliArt3({ soglie25NoviesSuperate: 0 }).righe[3];
    expect(conZero.esito).toBe('sotto');
    expect(conZero.fonteNecessaria).toBeNull();

    const senzaConfronto = valutaSegnaliArt3({ soglie25NoviesSuperate: null }).righe[3];
    expect(senzaConfronto.esito).toBe('non_determinabile');
  });

  it('un superamento è un segnale e la sintesi lo dice', () => {
    const esito = valutaSegnaliArt3({ soglie25NoviesSuperate: 2 });
    expect(esito.righe[3].esito).toBe('segnale');
    expect(esito.segnali).toBe(1);
    expect(esito.sintesi).toContain('1 segnale presente');
  });
});
