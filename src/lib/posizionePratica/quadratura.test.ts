import { describe, expect, it } from 'vitest';
import { TOLLERANZA_QUADRATURA_EURO, quadraturaCredito } from './quadratura';

// La quadratura non è un pareggio: se le fonti del credito divergono, gli
// scenari girerebbero su una cifra diversa da quella certificata.

describe('quadratura del credito', () => {
  it('due fonti che coincidono danno «coerente»', () => {
    const q = quadraturaCredito([
      { fonte: 'amministrativa', etichetta: 'Debito accertato', valore: 80_000 },
      { fonte: 'certificazione', etichetta: 'Certificazione dei debiti', valore: 80_000 },
    ]);
    expect(q.esito).toBe('COERENTE');
    expect(q.scostamenti).toHaveLength(1);
    expect(q.dettaglio).toContain('coincidono');
  });

  it('lo scostamento oltre la tolleranza è «divergente» e porta il delta', () => {
    const q = quadraturaCredito([
      { fonte: 'amministrativa', etichetta: 'Debito accertato', valore: 80_000 },
      { fonte: 'certificazione', etichetta: 'Certificazione dei debiti', valore: 82_500 },
    ]);
    expect(q.esito).toBe('DIVERGENTE');
    expect(q.scostamenti[0].delta).toBe(2_500);
    expect(q.dettaglio).toContain('82.500 €');
    expect(q.dettaglio).toContain('allineato');
  });

  it('un euro di arrotondamento non è una divergenza', () => {
    const q = quadraturaCredito([
      { fonte: 'a', etichetta: 'A', valore: 1_000 },
      { fonte: 'b', etichetta: 'B', valore: 1_000 + TOLLERANZA_QUADRATURA_EURO },
    ]);
    expect(q.esito).toBe('COERENTE');
  });

  it('una voce non confrontabile è mostrata ma non entra nella quadratura', () => {
    const q = quadraturaCredito([
      { fonte: 'amministrativa', etichetta: 'Debito accertato', valore: 80_000 },
      { fonte: 'certificazione', etichetta: 'Certificazione dei debiti', valore: 80_000 },
      {
        fonte: 'soglie',
        etichetta: 'Esposizione contributiva',
        valore: 40_000,
        confrontabile: false,
        nota: 'È un sottoinsieme del debito.',
      },
    ]);
    expect(q.esito).toBe('COERENTE');
    expect(q.voci).toHaveLength(3);
    expect(q.scostamenti.map((s) => s.fonte)).not.toContain('soglie');
  });

  it('una sola cifra non si confronta: «non verificabile», non «coerente»', () => {
    const q = quadraturaCredito([
      { fonte: 'amministrativa', etichetta: 'Debito accertato', valore: 80_000 },
      { fonte: 'certificazione', etichetta: 'Certificazione dei debiti', valore: null },
    ]);
    expect(q.esito).toBe('NON_VERIFICABILE');
    expect(q.dettaglio).toContain('una sola fonte');
    expect(q.dettaglio).toContain('Certificazione dei debiti');
  });

  it('senza nessuna cifra lo dice e nomina ciò che manca', () => {
    const q = quadraturaCredito([
      { fonte: 'a', etichetta: 'Debito accertato', valore: null },
      { fonte: 'b', etichetta: 'Certificazione dei debiti', valore: null },
    ]);
    expect(q.esito).toBe('NON_VERIFICABILE');
    expect(q.riferimento).toBeNull();
    expect(q.dettaglio).toContain('Debito accertato');
  });
});
