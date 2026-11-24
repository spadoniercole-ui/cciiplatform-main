import { describe, it, expect } from 'vitest';
import {
  confrontaDebitoInBilancio,
  gravitaDebito,
  importoInBilancio,
  titoloDebito,
  vocePerEnte,
} from './debitoInBilancio';

const base = {
  esposizione: 120000,
  vociBilancio: { tributari: 0, previdenziali: 0 },
  bilancioLetto: true,
  alias: ['INPS', 'Istituto Nazionale della Previdenza Sociale'],
};

describe('confrontaDebitoInBilancio', () => {
  it('dice «non contabilizzato» quando le voci pubbliche sono a zero', () => {
    const d = confrontaDebitoInBilancio(base);
    expect(d.stato).toBe('NON_CONTABILIZZATO');
    expect(gravitaDebito(d)).toBe('rosso');
    expect(d.testo).toContain('120.000 €');
    expect(d.testo).toMatch(/non trova riscontro/);
    // Gli alias sono l'unico modo per riconoscere il debito sotto un altro nome.
    expect(d.testo).toMatch(/Istituto Nazionale della Previdenza Sociale/);
  });

  it('riconosce il debito contabilizzato e ne riporta l’importo', () => {
    const d = confrontaDebitoInBilancio({
      ...base,
      vociBilancio: { tributari: 100000, previdenziali: 50000 },
    });
    expect(d.stato).toBe('CONTABILIZZATO');
    expect(gravitaDebito(d)).toBe('neutro');
    expect(d.testo).toContain('150.000 €');
  });

  it('un importo inferiore all’esposizione è un debito contabilizzato solo in parte', () => {
    const d = confrontaDebitoInBilancio({
      ...base,
      vociBilancio: { tributari: 20000, previdenziali: 20000 },
    });
    expect(d.stato).toBe('CONTABILIZZATO');
    expect(gravitaDebito(d)).toBe('ambra');
    expect(d.testo).toMatch(/solo in parte/);
    expect(titoloDebito(d)).toMatch(/solo in parte/);
  });

  it('senza bilancio non dichiara nulla: la verifica non è possibile', () => {
    const d = confrontaDebitoInBilancio({ ...base, bilancioLetto: false });
    expect(d.stato).toBe('NON_VERIFICABILE');
    expect(gravitaDebito(d)).toBe('ambra');
    expect(d.testo).toMatch(/Nessun bilancio/);
  });

  it('una voce non letta non vale zero', () => {
    const d = confrontaDebitoInBilancio({
      ...base,
      vociBilancio: { tributari: null, previdenziali: null },
    });
    expect(d.stato).toBe('NON_VERIFICABILE');
    expect(d.testo).toMatch(/non è stata letta/);
  });

  it('senza esposizione non c’è nulla da ritrovare', () => {
    const d = confrontaDebitoInBilancio({ ...base, esposizione: null });
    expect(d.stato).toBe('NON_VERIFICABILE');
  });

  it('senza alias lo dichiara: il nome in bilancio non è verificabile', () => {
    const d = confrontaDebitoInBilancio({ ...base, alias: [] });
    expect(d.testo).toMatch(/alias dell’ente non sono configurati/);
  });
});

describe('i tre stati, come si leggono', () => {
  const casi = [
    {
      nome: 'non contabilizzato',
      input: base,
      gravita: 'rosso',
      titolo: 'Debito verso l’ente non contabilizzato in bilancio',
    },
    {
      nome: 'contabilizzato per intero',
      input: { ...base, vociBilancio: { tributari: 0, previdenziali: 150000 } },
      gravita: 'neutro',
      titolo: 'Debito verso l’ente contabilizzato in bilancio',
    },
    {
      nome: 'contabilizzato solo in parte',
      input: { ...base, vociBilancio: { tributari: 0, previdenziali: 50000 } },
      gravita: 'ambra',
      titolo: 'Debito verso l’ente contabilizzato solo in parte',
    },
    {
      nome: 'verifica impossibile',
      input: { ...base, bilancioLetto: false },
      gravita: 'ambra',
      titolo: 'Debito verso l’ente: la verifica in bilancio non è possibile',
    },
  ] as const;

  for (const c of casi) {
    it(c.nome, () => {
      const d = confrontaDebitoInBilancio(c.input);
      expect(gravitaDebito(d)).toBe(c.gravita);
      expect(titoloDebito(d)).toBe(c.titolo);
    });
  }

  it('un debito parziale non si legge come una verifica impossibile', () => {
    const parziale = confrontaDebitoInBilancio({
      ...base,
      vociBilancio: { tributari: 0, previdenziali: 50000 },
    });
    const impossibile = confrontaDebitoInBilancio({ ...base, bilancioLetto: false });
    expect(titoloDebito(parziale)).not.toBe(titoloDebito(impossibile));
  });
});

describe('la voce che compete all’ente', () => {
  it('legge la classificazione dall’elenco chiuso dei parametri', () => {
    expect(vocePerEnte('INPS')).toBe('PREVIDENZIALI');
    expect(vocePerEnte('inail')).toBe('PREVIDENZIALI');
    expect(vocePerEnte('AGENZIA_ENTRATE')).toBe('TRIBUTARI');
    expect(vocePerEnte('NON_PUBBLICO')).toBeNull();
    expect(vocePerEnte(null)).toBeNull();
    // L'Agente della Riscossione porta a ruolo partite di natura diversa.
    expect(vocePerEnte('AGENZIA_RISCOSSIONE')).toBeNull();
  });

  it('prende solo la voce dell’ente, non la somma', () => {
    const voci = { tributari: 90000, previdenziali: 0 };
    expect(importoInBilancio(voci, 'PREVIDENZIALI')).toBe(0);
    expect(importoInBilancio(voci, 'TRIBUTARI')).toBe(90000);
    expect(importoInBilancio(voci, null)).toBe(90000);
  });

  it('un debito verso l’INPS non si copre con i debiti tributari', () => {
    const d = confrontaDebitoInBilancio({
      ...base,
      ente25novies: 'INPS',
      vociBilancio: { tributari: 150000, previdenziali: 0 },
    });
    expect(d.voce).toBe('PREVIDENZIALI');
    expect(d.inBilancio).toBe(0);
    expect(d.stato).toBe('NON_CONTABILIZZATO');
    expect(d.testo).toMatch(/debiti previdenziali/);
  });

  it('un debito verso l’Agenzia delle Entrate non si copre con i contributi', () => {
    const d = confrontaDebitoInBilancio({
      ...base,
      ente25novies: 'AGENZIA_ENTRATE',
      vociBilancio: { tributari: 0, previdenziali: 150000 },
    });
    expect(d.voce).toBe('TRIBUTARI');
    expect(d.stato).toBe('NON_CONTABILIZZATO');
    expect(d.testo).toMatch(/debiti tributari/);
  });

  it('la voce dell’ente a zero è zero, non una voce non letta', () => {
    const d = confrontaDebitoInBilancio({
      ...base,
      ente25novies: 'INPS',
      vociBilancio: { tributari: null, previdenziali: 0 },
    });
    expect(d.stato).toBe('NON_CONTABILIZZATO');
  });

  it('se la voce dell’ente non è stata letta, la verifica si ferma', () => {
    const d = confrontaDebitoInBilancio({
      ...base,
      ente25novies: 'AGENZIA_ENTRATE',
      vociBilancio: { tributari: null, previdenziali: 80000 },
    });
    expect(d.stato).toBe('NON_VERIFICABILE');
    expect(d.testo).toMatch(/non è stata letta/);
  });

  it('senza classificazione confronta la somma e lo dice', () => {
    const d = confrontaDebitoInBilancio({
      ...base,
      vociBilancio: { tributari: 60000, previdenziali: 60000 },
    });
    expect(d.voce).toBeNull();
    expect(d.stato).toBe('CONTABILIZZATO');
    expect(d.testo).toMatch(/non è classificato nei parametri/);
  });

  it('un ente classificato senza voce unica dichiara la somma', () => {
    const d = confrontaDebitoInBilancio({
      ...base,
      ente25novies: 'AGENZIA_RISCOSSIONE',
      vociBilancio: { tributari: 200000, previdenziali: 0 },
    });
    expect(d.voce).toBeNull();
    expect(d.testo).toMatch(/non stanno in una voce sola/);
  });
});
