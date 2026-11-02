import { describe, expect, it } from 'vitest';
import { chiaveTl, etichettaTl, normalizzaTl, rigaTl, validaTl, type Tl } from './catalogoTl';

const voce = (p: Partial<Tl> = {}): Tl => ({
  id: 1,
  codice: '81',
  descrizione: 'Diffida M400',
  checkList: false,
  versoCheckList: null,
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
});

describe('chiave ed etichetta', () => {
  it('la chiave del codice non dipende dalla grafia', () => {
    expect(chiaveTl('  TS-81 ')).toBe('ts-81');
  });

  it('l’etichetta mette il codice davanti alla descrizione', () => {
    expect(etichettaTl(voce())).toBe('81 — Diffida M400');
    expect(etichettaTl({ codice: '', descrizione: 'Diffida M400' })).toBe('Diffida M400');
  });
});
