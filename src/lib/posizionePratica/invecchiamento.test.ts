import { describe, expect, it } from 'vitest';
import { valutaInvecchiamento } from './invecchiamento';

// Un dato arrivato dopo la verifica fa invecchiare la posizione: va detto
// prima che qualcuno la citi come aggiornata.

describe('invecchiamento della posizione', () => {
  it('senza dati successivi è aggiornata', () => {
    const i = valutaInvecchiamento({
      verifica: { fonte: 'amministrativa', data: '2026-11-16', cosa: 'verifica amministrativa' },
      dati: [
        { fonte: 'bilancio', data: '2026-04-30', cosa: 'ultimo bilancio' },
        { fonte: 'visura', data: '2026-11-10', cosa: 'visura camerale' },
      ],
    });
    expect(i.esito).toBe('AGGIORNATO');
    expect(i.superati).toHaveLength(0);
  });

  it('un bilancio depositato dopo la verifica la rende «da ricalcolare»', () => {
    const i = valutaInvecchiamento({
      verifica: { fonte: 'amministrativa', data: '2026-06-30', cosa: 'verifica amministrativa' },
      dati: [{ fonte: 'bilancio', data: '2026-09-15', cosa: 'bilancio 2025 depositato' }],
    });
    expect(i.esito).toBe('DA_RICALCOLARE');
    expect(i.superati).toHaveLength(1);
    expect(i.dettaglio).toContain('bilancio 2025 depositato');
  });

  it('elenca tutti i dati più recenti, non solo il primo', () => {
    const i = valutaInvecchiamento({
      verifica: { fonte: 'amministrativa', data: '2026-06-30', cosa: 'verifica' },
      dati: [
        { fonte: 'bilancio', data: '2026-09-15', cosa: 'bilancio' },
        { fonte: 'debito', data: '2026-10-01', cosa: 'debito riaccertato' },
        { fonte: 'visura', data: '2026-05-01', cosa: 'visura' },
      ],
    });
    expect(i.superati.map((s) => s.fonte)).toEqual(['bilancio', 'debito']);
  });

  it('senza la data della verifica non si può dire: «non databile»', () => {
    const i = valutaInvecchiamento({
      verifica: { fonte: 'amministrativa', data: null, cosa: 'verifica' },
      dati: [{ fonte: 'bilancio', data: '2026-09-15', cosa: 'bilancio' }],
    });
    expect(i.esito).toBe('NON_DATABILE');
    expect(i.dettaglio).toContain('non porta una data');
  });

  it('una data illeggibile non viene trattata come recente né come superata', () => {
    const i = valutaInvecchiamento({
      verifica: { fonte: 'amministrativa', data: '2026-06-30', cosa: 'verifica' },
      dati: [{ fonte: 'bilancio', data: 'non-una-data', cosa: 'bilancio' }],
    });
    expect(i.esito).toBe('AGGIORNATO');
  });
});
