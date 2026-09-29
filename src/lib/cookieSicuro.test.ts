import { describe, expect, it } from 'vitest';
import { cookieSicuro } from './cookieSicuro';

describe('cookieSicuro', () => {
  const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

  it('in cloud (produzione) il cookie è sempre Secure', () => {
    expect(cookieSicuro(env({ NODE_ENV: 'production' }))).toBe(true);
  });

  it('in sviluppo mai', () => {
    expect(cookieSicuro(env({ NODE_ENV: 'development' }))).toBe(false);
  });

  it('portable su un solo PC (http://127.0.0.1): non Secure', () => {
    expect(cookieSicuro(env({ NODE_ENV: 'production', PORTABLE: '1' }))).toBe(false);
  });

  it('portable in rete locale con HTTPS: Secure', () => {
    expect(cookieSicuro(env({ NODE_ENV: 'production', PORTABLE: '1', PORTABLE_HTTPS: '1' }))).toBe(
      true
    );
  });
});
