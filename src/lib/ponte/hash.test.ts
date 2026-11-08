import { describe, expect, it } from 'vitest';
import { calcolaHashInput, hashJson } from './hash';

describe('hash del Ponte', () => {
  it('è stabile al variare dell’ordine delle chiavi', () => {
    expect(hashJson({ b: 2, a: 1 })).toBe(hashJson({ a: 1, b: 2 }));
  });

  it('cambia quando cambia un dato di input', () => {
    expect(calcolaHashInput({ data: '2025-06-30', ricavi: 100 })).not.toBe(
      calcolaHashInput({ data: '2025-06-30', ricavi: 101 })
    );
  });

  it('distingue un array diverso anche a parità di chiavi', () => {
    expect(hashJson([1, 2])).not.toBe(hashJson([2, 1]));
  });
});
