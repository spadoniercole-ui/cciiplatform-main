import { describe, it, expect } from 'vitest';
import { confrontaDebitoInBilancio } from './debitoInBilancio';

const base = {
  esposizione: 120000,
  inBilancio: 0,
  bilancioLetto: true,
  alias: ['INPS', 'Istituto Nazionale della Previdenza Sociale'],
  voci: 'i debiti tributari e previdenziali',
};

describe('confrontaDebitoInBilancio', () => {
  it('dice «non contabilizzato» quando le voci pubbliche sono a zero', () => {
    const d = confrontaDebitoInBilancio(base);
    expect(d.stato).toBe('NON_CONTABILIZZATO');
    expect(d.segnala).toBe(true);
    expect(d.testo).toContain('120.000 €');
    expect(d.testo).toMatch(/non trova riscontro/);
    // Gli alias sono l'unico modo per riconoscere il debito sotto un altro nome.
    expect(d.testo).toMatch(/Istituto Nazionale della Previdenza Sociale/);
  });

  it('riconosce il debito contabilizzato e ne riporta l’importo', () => {
    const d = confrontaDebitoInBilancio({ ...base, inBilancio: 150000 });
    expect(d.stato).toBe('CONTABILIZZATO');
    expect(d.segnala).toBe(false);
    expect(d.testo).toContain('150.000 €');
  });

  it('un importo inferiore all’esposizione è un debito contabilizzato solo in parte', () => {
    const d = confrontaDebitoInBilancio({ ...base, inBilancio: 40000 });
    expect(d.stato).toBe('CONTABILIZZATO');
    expect(d.segnala).toBe(true);
    expect(d.testo).toMatch(/solo in parte/);
  });

  it('senza bilancio non dichiara nulla: la verifica non è possibile', () => {
    const d = confrontaDebitoInBilancio({ ...base, bilancioLetto: false });
    expect(d.stato).toBe('NON_VERIFICABILE');
    expect(d.segnala).toBe(false);
    expect(d.testo).toMatch(/Nessun bilancio/);
  });

  it('una voce non letta non vale zero', () => {
    const d = confrontaDebitoInBilancio({ ...base, inBilancio: null });
    expect(d.stato).toBe('NON_VERIFICABILE');
    expect(d.testo).toMatch(/non sono state lette/);
  });

  it('senza esposizione non c’è nulla da ritrovare', () => {
    const d = confrontaDebitoInBilancio({ ...base, esposizione: null });
    expect(d.stato).toBe('NON_VERIFICABILE');
  });

  it('senza alias lo dichiara: il nome in bilancio non è verificabile', () => {
    const d = confrontaDebitoInBilancio({ ...base, alias: [] });
    expect(d.alias).toEqual([]);
    expect(d.testo).toMatch(/alias dell’ente non sono configurati/);
  });
});
