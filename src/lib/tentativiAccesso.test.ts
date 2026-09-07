import { describe, it, expect, beforeEach } from 'vitest';
import {
  controllaTentativi,
  registraFallimento,
  azzeraTentativi,
  MAX_TENTATIVI,
  MINUTI_BLOCCO,
} from './tentativiAccesso';

// Difesa dell'account più potente della piattaforma: il Superadmin ha una
// password statica, in chiaro nella configurazione, su una porta pubblica.
// Fino a ieri i tentativi erano illimitati.

describe('limitazione dei tentativi', () => {
  beforeEach(() => azzeraTentativi('prova'));

  it('parte libera, con tutti i tentativi disponibili', () => {
    const e = controllaTentativi('prova');
    expect(e.bloccato).toBe(false);
    expect(e.rimanenti).toBe(MAX_TENTATIVI);
  });

  it('scala i tentativi a ogni fallimento', () => {
    registraFallimento('prova');
    expect(controllaTentativi('prova').rimanenti).toBe(MAX_TENTATIVI - 1);
    registraFallimento('prova');
    expect(controllaTentativi('prova').rimanenti).toBe(MAX_TENTATIVI - 2);
  });

  it('blocca al raggiungimento del limite', () => {
    for (let i = 0; i < MAX_TENTATIVI - 1; i++) {
      expect(registraFallimento('prova').bloccato).toBe(false);
    }
    expect(registraFallimento('prova').bloccato).toBe(true);
    expect(controllaTentativi('prova').bloccato).toBe(true);
  });

  it('un accesso riuscito azzera il contatore', () => {
    registraFallimento('prova');
    registraFallimento('prova');
    azzeraTentativi('prova');
    expect(controllaTentativi('prova').rimanenti).toBe(MAX_TENTATIVI);
  });

  it('il blocco scade e l’accesso si riapre', () => {
    for (let i = 0; i < MAX_TENTATIVI; i++) registraFallimento('prova');
    const dopo = Date.now() + (MINUTI_BLOCCO + 1) * 60 * 1000;
    const e = controllaTentativi('prova', dopo);
    expect(e.bloccato).toBe(false);
    expect(e.rimanenti).toBe(MAX_TENTATIVI);
  });

  it('i contatori sono indipendenti per chiave', () => {
    // Bloccare un'identità non deve chiudere fuori le altre.
    for (let i = 0; i < MAX_TENTATIVI; i++) registraFallimento('prova');
    expect(controllaTentativi('prova').bloccato).toBe(true);
    expect(controllaTentativi('altra').bloccato).toBe(false);
    azzeraTentativi('altra');
  });
});
