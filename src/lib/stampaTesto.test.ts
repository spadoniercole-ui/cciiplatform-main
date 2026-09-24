import { describe, it, expect } from 'vitest';
import { improntaContenuto, piedeDocumento } from './stampaTesto';
import { APP_VERSION } from './appVersion';

describe('piede dei documenti esportati', () => {
  it('l’impronta è la SHA-256 del contenuto', async () => {
    expect(await improntaContenuto('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
  it('il piede porta versione, date e impronta', async () => {
    const p = piedeDocumento(await improntaContenuto('x'), '2026-09-22T10:00:00Z');
    expect(p).toContain(`CCIIPlatform ${APP_VERSION}`);
    expect(p).toContain('contenuto generato il');
    expect(p).toMatch(/[0-9a-f]{64}/);
  });
});

describe('parametri di stampa', () => {
  it('impostaParametriStampa accetta null (torna ai predefiniti)', async () => {
    const { impostaParametriStampa, PARAMETRI_STAMPA_PREDEFINITI } = await import('./stampaTesto');
    expect(() => impostaParametriStampa(null)).not.toThrow();
    expect(PARAMETRI_STAMPA_PREDEFINITI.margini.alto).toBe(15);
  });
});
