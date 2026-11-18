import { describe, expect, it } from 'vitest';
import { normalizzaRisultato } from './risultato';

describe('normalizzaRisultato', () => {
  it('un SELECT che trova una riga conta una riga, anche se PGlite dice affectedRows 0', () => {
    // Il caso vero: PGlite restituisce affectedRows 0 per una lettura.
    const r = normalizzaRisultato({
      rows: [{ domande: [] }],
      fields: [{ name: 'domande' }],
      affectedRows: 0,
    });
    expect(r.rowCount).toBe(1);
    expect(r.rows).toHaveLength(1);
  });

  it('un SELECT senza righe resta zero', () => {
    expect(normalizzaRisultato({ rows: [], fields: [], affectedRows: 0 }).rowCount).toBe(0);
  });

  it('una scrittura senza RETURNING conta le righe toccate', () => {
    expect(normalizzaRisultato({ rows: [], affectedRows: 3 }).rowCount).toBe(3);
  });

  it('una scrittura con RETURNING conta le righe restituite', () => {
    expect(normalizzaRisultato({ rows: [{ id: 1 }, { id: 2 }], affectedRows: 2 }).rowCount).toBe(2);
  });

  it('senza nulla non inventa righe', () => {
    const r = normalizzaRisultato(null);
    expect(r).toEqual({ rows: [], rowCount: 0, fields: [] });
  });
});
