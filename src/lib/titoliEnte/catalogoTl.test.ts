import { describe, expect, it } from 'vitest';
import {
  chiaveTl,
  etichettaProdottoTl,
  etichettaTl,
  normalizzaTl,
  rigaTl,
  validaTl,
  type Tl,
} from './catalogoTl';

const voce = (p: Partial<Tl> = {}): Tl => ({
  id: 1,
  codice: '81',
  descrizione: 'Diffida M400',
  checkList: false,
  versoCheckList: null,
  prodotti: [],
  ordine: 1,
  materie: 0,
  ...p,
});

describe('validaTl', () => {
  it('pretende il codice: è l’identità della TS nei documenti', () => {
    expect(validaTl({ codice: '  ', descrizione: 'Diffida' })).toMatch(/codice/);
  });

  it('pretende la descrizione: senza, non si sa che cosa si lavora', () => {
    expect(validaTl({ codice: '81', descrizione: ' ' })).toMatch(/descrizione/);
  });

  it('pretende il verso quando la TS entra nella check list', () => {
    expect(validaTl({ codice: '81', descrizione: 'Diffida', checkList: true })).toMatch(
      /collaborativa o di resistenza/
    );
  });

  it('accetta una TS completa', () => {
    expect(
      validaTl({
        codice: '81',
        descrizione: 'Diffida M400',
        checkList: true,
        versoCheckList: 'RESISTENZA',
      })
    ).toBeNull();
  });

  it('accetta più prodotti sulla stessa TS: è un’associazione tanti a tanti', () => {
    expect(
      validaTl({
        codice: '81',
        descrizione: 'Diffida M400',
        prodotti: [
          { direttrice: 'Vigilanza documentale', prodotto: 'Diffida M400' },
          { direttrice: 'Vigilanza documentale', prodotto: 'Diffida sgravi' },
        ],
      })
    ).toBeNull();
  });

  it('rifiuta un’associazione senza prodotto', () => {
    expect(
      validaTl({
        codice: '81',
        descrizione: 'Diffida',
        prodotti: [{ direttrice: 'Vigilanza documentale', prodotto: ' ' }],
      })
    ).toMatch(/prodotto/);
  });

  it('rifiuta un prodotto senza la sua direttrice', () => {
    expect(
      validaTl({
        codice: '81',
        descrizione: 'Diffida',
        prodotti: [{ direttrice: '', prodotto: 'Diffida M400' }],
      })
    ).toMatch(/direttrice/);
  });

  it('rifiuta la stessa coppia scritta due volte, anche con grafia diversa', () => {
    expect(
      validaTl({
        codice: '81',
        descrizione: 'Diffida',
        prodotti: [
          { direttrice: 'Vigilanza', prodotto: 'Diffida M400' },
          { direttrice: '  vigilanza ', prodotto: 'diffida   m400' },
        ],
      })
    ).toMatch(/due volte/);
  });
});

describe('normalizzaTl', () => {
  it('compatta gli spazi e toglie il verso quando la TS non è nella check list', () => {
    const n = normalizzaTl({
      codice: '  81  ',
      descrizione: '  Diffida   M400 ',
      checkList: false,
      versoCheckList: 'RESISTENZA',
    });
    expect(n.codice).toBe('81');
    expect(n.descrizione).toBe('Diffida M400');
    expect(n.versoCheckList).toBeNull();
  });

  it('compatta i prodotti, toglie i vuoti e i doppioni, e ne tiene il primo per la lettura singola', () => {
    const n = normalizzaTl({
      codice: '81',
      descrizione: 'Diffida',
      prodotti: [
        { direttrice: ' Vigilanza  documentale ', prodotto: ' Diffida   M400 ' },
        { direttrice: '', prodotto: ' ' },
        { direttrice: 'vigilanza documentale', prodotto: 'diffida m400' },
        { direttrice: 'Vigilanza documentale', prodotto: 'Diffida sgravi' },
      ],
    });
    expect(n.prodotti).toEqual([
      { direttrice: 'Vigilanza documentale', prodotto: 'Diffida M400' },
      { direttrice: 'Vigilanza documentale', prodotto: 'Diffida sgravi' },
    ]);
    expect(n.direttrice).toBe('Vigilanza documentale');
    expect(n.prodotto).toBe('Diffida M400');
  });

  it('accetta ancora la coppia singola, per chi manda una sola associazione', () => {
    const n = normalizzaTl({
      codice: '81',
      descrizione: 'Diffida',
      direttrice: 'Vigilanza documentale',
      prodotto: 'Diffida M400',
    });
    expect(n.prodotti).toEqual([{ direttrice: 'Vigilanza documentale', prodotto: 'Diffida M400' }]);
  });
});

describe('rigaTl', () => {
  it('legge il flag della check list e il verso dalla riga del database', () => {
    const t = rigaTl({
      id: 7,
      codice: '76',
      descrizione: 'CISOA',
      check_list: true,
      verso_check_list: 'COLLABORATIVA',
      ordine: 3,
      materie: '2',
    });
    expect(t).toMatchObject({
      id: 7,
      codice: '76',
      descrizione: 'CISOA',
      checkList: true,
      versoCheckList: 'COLLABORATIVA',
      ordine: 3,
      materie: 2,
    });
  });

  it('legge i prodotti dal jsonb, anche se arriva come testo', () => {
    const t = rigaTl({
      id: 1,
      codice: '81',
      descrizione: 'Diffida',
      prodotti: [
        { direttrice: 'Vigilanza documentale', prodotto: 'Diffida M400' },
        { direttrice: 'Vigilanza documentale', prodotto: 'Diffida sgravi' },
      ],
    });
    expect(t.prodotti).toHaveLength(2);
    expect(t.prodotto).toBe('Diffida M400');

    const daTesto = rigaTl({
      id: 1,
      codice: '81',
      descrizione: 'Diffida',
      prodotti: '[{"direttrice":"Vigilanza","prodotto":"Diffida"}]',
    });
    expect(daTesto.prodotti).toEqual([{ direttrice: 'Vigilanza', prodotto: 'Diffida' }]);
  });

  it('legge la coppia singola degli spazi non ancora migrati', () => {
    const t = rigaTl({
      id: 1,
      codice: '81',
      descrizione: 'Diffida',
      direttrice: 'Vigilanza documentale',
      prodotto: 'Diffida M400',
    });
    expect(t.prodotti).toEqual([{ direttrice: 'Vigilanza documentale', prodotto: 'Diffida M400' }]);
  });
});

describe('chiave ed etichette', () => {
  it('la chiave del codice non dipende dalla grafia', () => {
    expect(chiaveTl('  TS-81 ')).toBe('ts-81');
  });

  it('l’etichetta mette il codice davanti alla descrizione', () => {
    expect(etichettaTl(voce())).toBe('81 — Diffida M400');
    expect(etichettaTl({ codice: '', descrizione: 'Diffida M400' })).toBe('Diffida M400');
  });

  it('l’etichetta del prodotto porta la direttrice davanti', () => {
    expect(etichettaProdottoTl({ direttrice: 'Vigilanza', prodotto: 'Diffida' })).toBe(
      'Vigilanza · Diffida'
    );
    expect(etichettaProdottoTl({ direttrice: '', prodotto: 'Diffida' })).toBe('Diffida');
  });
});
