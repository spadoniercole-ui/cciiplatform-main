import { describe, expect, it } from 'vitest';
import {
  formattaEuro,
  formattaEuroONull,
  formattaGiorno,
  formattaGiornoOra,
  formattaNumero,
  soloGiorno,
} from './numeri';

// Il difetto che ha originato il modulo: la stessa pagina scriveva 77.090 € e
// 7782 €. Qui si fissa la forma, una volta per tutte.

describe('formattazione dei numeri', () => {
  it('separa le migliaia anche sotto i diecimila', () => {
    expect(formattaNumero(7782)).toBe('7.782');
    expect(formattaNumero(77_090)).toBe('77.090');
    expect(formattaNumero(152_000.4)).toBe('152.000');
  });

  it('l’importo assente è un trattino, non zero', () => {
    expect(formattaEuro(null)).toBe('—');
    expect(formattaEuro(undefined)).toBe('—');
    expect(formattaEuro(Number.NaN)).toBe('—');
    expect(formattaEuro(0)).toBe('0 €');
    expect(formattaEuro(7_782)).toBe('7.782 €');
    expect(formattaEuroONull(null)).toBeNull();
    expect(formattaEuroONull(7_782)).toBe('7.782 €');
  });

  it('la data mancante non diventa «Invalid Date»', () => {
    expect(formattaGiorno('2026-11-17')).toBe('17/11/2026');
    expect(formattaGiorno(null)).toBeNull();
    expect(formattaGiorno('non-una-data')).toBeNull();
    expect(formattaGiornoOra('2026-11-17T09:05:00.000Z')).toMatch(/17\/11\/2026/);
    expect(formattaGiornoOra(null)).toBe('—');
  });

  it('il giorno civile si confronta senza fuso', () => {
    expect(soloGiorno('2026-11-17T23:30:00.000Z')).toBe('2026-11-17');
    expect(soloGiorno('')).toBeNull();
  });
});
