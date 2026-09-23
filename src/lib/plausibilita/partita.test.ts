import { describe, it, expect } from 'vitest';
import { controllaPartita } from './partita';

const ESISTENTI = [
  { importo: 12_300, codice: '27', voce: 'Contributi gennaio', data: '2025-01-16' },
  { importo: 11_800, codice: '27', voce: 'Contributi febbraio', data: '2025-02-16' },
  { importo: 12_900, codice: '27', voce: 'Contributi marzo', data: '2025-03-16' },
];

describe('plausibilità di una partita imputata a mano', () => {
  it('123.000 al posto di 12.300: uno zero in più', () => {
    const a = controllaPartita(
      {
        voce: 'Contributi aprile',
        importo: 123_000,
        importoVersato: null,
        data: '2025-04-16',
        codice: '27',
      },
      ESISTENTI,
      ['27', '25'],
      '2026-09-23'
    );
    expect(a.some((x) => x.campo === 'importo' && x.testo.includes('più grande'))).toBe(true);
  });
  it('500 al posto di 5.000: uno zero in meno', () => {
    const a = controllaPartita(
      { voce: 'x', importo: 1_200, importoVersato: null, data: null, codice: '27' },
      ESISTENTI,
      null,
      '2026-09-23'
    );
    expect(a.some((x) => x.testo.includes('più piccolo'))).toBe(true);
  });
  it('versato maggiore del dovuto, data futura, codice fuori anagrafica, doppione', () => {
    const a = controllaPartita(
      {
        voce: 'Contributi gennaio',
        importo: 12_300,
        importoVersato: 20_000,
        data: '2027-01-01',
        codice: '54',
      },
      ESISTENTI,
      ['27'],
      '2026-09-23'
    );
    expect(a.map((x) => x.campo)).toEqual(
      expect.arrayContaining(['importoVersato', 'data', 'codice'])
    );
    const b = controllaPartita(
      {
        voce: 'contributi gennaio',
        importo: 12_300,
        importoVersato: null,
        data: '2025-01-16',
        codice: '27',
      },
      ESISTENTI,
      ['27'],
      '2026-09-23'
    );
    expect(b.some((x) => x.campo === 'voce')).toBe(true);
  });
  it('una partita normale non produce avvisi', () => {
    expect(
      controllaPartita(
        {
          voce: 'Contributi aprile',
          importo: 12_500,
          importoVersato: 1_000,
          data: '2025-04-16',
          codice: '27',
        },
        ESISTENTI,
        ['27'],
        '2026-09-23'
      )
    ).toEqual([]);
  });
});
