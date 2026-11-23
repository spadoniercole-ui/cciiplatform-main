import { describe, expect, it } from 'vitest';
import {
  PALLINO,
  SIGNIFICATO_TONO,
  TONI,
  tonoDaEsitoIndice,
  tonoDaGiudizio,
  tonoDaStatoPasso,
} from './significato';

describe('significato dei colori', () => {
  it('i quattro toni hanno tutti una parola e una spiegazione, e nessuna è vuota', () => {
    expect(TONI).toEqual(['verde', 'giallo', 'rosso', 'grigio']);
    for (const tono of TONI) {
      expect(SIGNIFICATO_TONO[tono].breve.trim()).not.toBe('');
      expect(SIGNIFICATO_TONO[tono].esteso.trim()).not.toBe('');
      expect(PALLINO[tono]).toMatch(/^bg-/);
    }
  });

  it('i quattro toni dicono cose diverse: nessun doppione', () => {
    const parole = TONI.map((t) => SIGNIFICATO_TONO[t].breve);
    expect(new Set(parole).size).toBe(TONI.length);
  });

  it("l'esito di un indice: dentro la soglia è verde, oltre è rosso, non calcolabile è grigio", () => {
    expect(tonoDaEsitoIndice('OK')).toBe('verde');
    expect(tonoDaEsitoIndice('VIOLATO')).toBe('rosso');
    expect(tonoDaEsitoIndice(null)).toBe('grigio');
    expect(tonoDaEsitoIndice(undefined)).toBe('grigio');
  });

  it('lo stato di un passo: completo è verde, da fare giallo, non disponibile grigio', () => {
    expect(tonoDaStatoPasso('completo')).toBe('verde');
    expect(tonoDaStatoPasso('attivo')).toBe('giallo');
    expect(tonoDaStatoPasso('bloccato')).toBe('grigio');
  });

  it('il giudizio della Check List non cambia nome passando dai colori', () => {
    for (const colore of ['verde', 'giallo', 'rosso', 'grigio'] as const) {
      expect(tonoDaGiudizio(colore)).toBe(colore);
    }
  });
});
