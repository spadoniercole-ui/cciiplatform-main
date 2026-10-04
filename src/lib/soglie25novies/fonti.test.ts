import { describe, expect, it } from 'vitest';
import { scegliValore } from './fonti';

describe('scegliValore', () => {
  it('le posizioni del triage prevalgono sul valore scritto a mano', () => {
    expect(scegliValore(1000, 500, 41_993)).toEqual({ valore: 1000, fonte: 'triage' });
  });
  it('senza triage vale il valore scritto a mano', () => {
    expect(scegliValore(null, 500, 41_993)).toEqual({ valore: 500, fonte: 'manuale' });
  });
  it('campo vuoto: ripiego sul V.E.R.A. se positivo', () => {
    expect(scegliValore(null, null, 41_993)).toEqual({ valore: 41_993, fonte: 'vera' });
    expect(scegliValore(null, null, 0)).toBeNull();
    expect(scegliValore(undefined, null)).toBeNull();
  });
  it('uno zero scritto a mano è un valore, non un campo vuoto', () => {
    expect(scegliValore(null, 0, 41_993)).toEqual({ valore: 0, fonte: 'manuale' });
  });
});
