import { describe, expect, it } from 'vitest';
import {
  domandeDaCatalogo,
  MASSIMO_DOMANDE_PRODOTTI,
  pulisciDomandeGenerate,
  sintesiChecklistProdotti,
  type RigaChecklistProdotto,
  type TlCatalogo,
} from './prodotti';

const tl = (over: Partial<TlCatalogo>): TlCatalogo => ({
  id: 1,
  direttrice: 'Entrate',
  prodotto: 'DURC',
  tipologia: 'Richiesta DURC',
  dipendenza: 'Ufficio contributi',
  ...over,
});

describe('domande di base dal catalogo', () => {
  it('una domanda per TL, con prodotto e ufficio nel testo', () => {
    const d = domandeDaCatalogo([tl({})]);
    expect(d).toHaveLength(1);
    expect(d[0].prodotto).toBe('DURC');
    expect(d[0].direttrice).toBe('Entrate');
    expect(d[0].domanda).toContain('Richiesta DURC');
    expect(d[0].domanda).toContain('Ufficio contributi');
  });

  it('la stessa lavorazione sullo stesso prodotto non si ripete', () => {
    const d = domandeDaCatalogo([tl({}), tl({ id: 2, prodotto: ' durc ' })]);
    expect(d).toHaveLength(1);
  });

  it('senza ufficio il testo non resta con parentesi vuote', () => {
    const d = domandeDaCatalogo([tl({ dipendenza: null })]);
    expect(d[0].domanda).not.toContain('ufficio');
  });

  it('scarta le righe senza prodotto o senza tipologia', () => {
    expect(domandeDaCatalogo([tl({ prodotto: '  ' }), tl({ id: 2, tipologia: '' })])).toEqual([]);
  });

  it('si ferma al massimo, invece di generare un questionario illeggibile', () => {
    const tante = Array.from({ length: MASSIMO_DOMANDE_PRODOTTI + 20 }, (_, i) =>
      tl({ id: i + 1, prodotto: `P${i}` })
    );
    expect(domandeDaCatalogo(tante)).toHaveLength(MASSIMO_DOMANDE_PRODOTTI);
  });
});

describe('pulizia delle domande proposte dall’AI', () => {
  it('accetta sia l’array sia l’oggetto con «domande»', () => {
    expect(pulisciDomandeGenerate([{ prodotto: 'IVA', domanda: 'Domanda?' }])).toHaveLength(1);
    expect(
      pulisciDomandeGenerate({ domande: [{ prodotto: 'IVA', domanda: 'Domanda?' }] })
    ).toHaveLength(1);
  });

  it('scarta ciò che non ha prodotto o testo', () => {
    const out = pulisciDomandeGenerate([
      { prodotto: '', domanda: 'Domanda?' },
      { prodotto: 'IVA', domanda: '   ' },
      null,
      'testo',
    ]);
    expect(out).toEqual([]);
  });

  it('toglie i doppioni e compatta gli spazi', () => {
    const out = pulisciDomandeGenerate([
      { prodotto: ' IVA ', domanda: 'La  dichiarazione   è stata presentata?' },
      { prodotto: 'iva', domanda: 'la dichiarazione è stata presentata?' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].prodotto).toBe('IVA');
    expect(out[0].domanda).toBe('La dichiarazione è stata presentata?');
  });

  it('rifiuta testi fuori misura', () => {
    expect(pulisciDomandeGenerate([{ prodotto: 'x'.repeat(121), domanda: 'ok?' }])).toEqual([]);
    expect(pulisciDomandeGenerate([{ prodotto: 'IVA', domanda: 'x'.repeat(401) }])).toEqual([]);
  });

  it('un valore che non è né array né oggetto non produce nulla', () => {
    expect(pulisciDomandeGenerate('testo')).toEqual([]);
    expect(pulisciDomandeGenerate(null)).toEqual([]);
  });
});

describe('sintesi della check list per prodotto', () => {
  const riga = (over: Partial<RigaChecklistProdotto>): RigaChecklistProdotto => ({
    id: 1,
    prodotto: 'DURC',
    direttrice: 'Entrate',
    domanda: 'Domanda?',
    risposta: null,
    note: null,
    ordine: 0,
    ...over,
  });

  it('raggruppa per prodotto e conta risposte e criticità', () => {
    const s = sintesiChecklistProdotti([
      riga({ id: 1, risposta: true }),
      riga({ id: 2, risposta: false, ordine: 1 }),
      riga({ id: 3, prodotto: 'IVA', risposta: null }),
    ]);
    expect(s.sezioni).toHaveLength(2);
    expect(s.totale).toBe(3);
    expect(s.risposte).toBe(2);
    expect(s.criticita).toBe(1);
    expect(s.completa).toBe(false);
    expect(s.senzaRisposta).toEqual([{ prodotto: 'IVA', domanda: 'Domanda?' }]);
  });

  it('una sezione è completa solo se ogni sua domanda ha risposta', () => {
    const s = sintesiChecklistProdotti([
      riga({ id: 1, risposta: true }),
      riga({ id: 2, risposta: false }),
    ]);
    expect(s.sezioni[0].completa).toBe(true);
    expect(s.completa).toBe(true);
  });

  it('senza domande la check list non è completa (e non è un successo vuoto)', () => {
    const s = sintesiChecklistProdotti([]);
    expect(s.completa).toBe(false);
    expect(s.sezioni).toEqual([]);
  });

  it('ordina le domande per ordine, non per id di inserimento', () => {
    const s = sintesiChecklistProdotti([
      riga({ id: 9, domanda: 'Seconda', ordine: 1 }),
      riga({ id: 2, domanda: 'Prima', ordine: 0 }),
    ]);
    expect(s.sezioni[0].righe.map((r) => r.domanda)).toEqual(['Prima', 'Seconda']);
  });
});
