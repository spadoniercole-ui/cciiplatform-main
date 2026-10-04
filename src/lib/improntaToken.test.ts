import { describe, expect, it } from 'vitest';
import { improntaToken } from './improntaToken';

describe('improntaToken', () => {
  it('è deterministica, di 64 caratteri esadecimali e diversa dal token', () => {
    const t = 'a'.repeat(64);
    expect(improntaToken(t)).toBe(improntaToken(t));
    expect(improntaToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(improntaToken(t)).not.toBe(t);
    expect(improntaToken(t)).not.toBe(improntaToken('b'.repeat(64)));
  });
});
