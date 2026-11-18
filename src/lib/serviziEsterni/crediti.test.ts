import { describe, expect, it } from 'vitest';
import { ETICHETTA_STATO, leggiAnthropic, leggiGitHub, servizioNonConfigurato } from './crediti';

describe('leggiAnthropic', () => {
  it('una risposta 200 è disponibile', () => {
    expect(leggiAnthropic(200, '{"data":[]}').stato).toBe('OK');
  });

  it('401 è la chiave rifiutata, non il credito', () => {
    const l = leggiAnthropic(401, '{"error":"authentication_error"}');
    expect(l.stato).toBe('CREDENZIALE_NON_VALIDA');
    expect(l.rimedio).toMatch(/secret/i);
  });

  it('400 con messaggio sul credito è credito esaurito, e lo dice con il rimedio giusto', () => {
    const l = leggiAnthropic(400, '{"error":{"message":"Your credit balance is too low"}}');
    expect(l.stato).toBe('CREDITO_ESAURITO');
    expect(l.rimedio).toMatch(/Ricarica il credito/i);
  });

  it('429 è il limite di richieste', () => {
    expect(leggiAnthropic(429, '').stato).toBe('LIMITE_RAGGIUNGIMENTO');
  });

  it('un 500 non è verde', () => {
    const l = leggiAnthropic(500, '');
    expect(l.stato).toBe('NON_RAGGIUNGIBILE');
    expect(ETICHETTA_STATO[l.stato]).toBe('Non raggiungibile');
  });
});

describe('leggiGitHub', () => {
  const json = (remaining: number, limit = 60, reset = 1800000000) => ({
    resources: { core: { remaining, limit, reset } },
  });

  it('legge le richieste residue e, senza token, suggerisce il token', () => {
    const l = leggiGitHub(json(41), false, 1799999000000);
    expect(l.stato).toBe('OK');
    expect(l.dettaglio).toContain('41');
    expect(l.rimedio).toContain('GH_TOKEN');
  });

  it('zero richieste è limite raggiunto, con l’orario di rinnovo', () => {
    const l = leggiGitHub(json(0), true, 1799999000000);
    expect(l.stato).toBe('LIMITE_RAGGIUNGIMENTO');
    expect(l.dettaglio).toMatch(/rinnovo alle/);
  });

  it('una risposta senza contatori non è un credito disponibile', () => {
    expect(leggiGitHub({}, true).stato).toBe('NON_RAGGIUNGIBILE');
  });
});

describe('servizioNonConfigurato', () => {
  it('dice quale variabile manca', () => {
    const l = servizioNonConfigurato('ANTHROPIC_API_KEY');
    expect(l.stato).toBe('NON_CONFIGURATO');
    expect(l.dettaglio).toContain('ANTHROPIC_API_KEY');
  });
});
