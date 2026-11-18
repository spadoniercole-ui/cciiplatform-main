import { describe, expect, it } from 'vitest';
import {
  MESSAGGIO_CONTABILE_MANCANTE,
  puoValutareCompleta,
  type CondizioniValutazione,
} from './prerequisitiValutazione';

const base = (c: Partial<CondizioniValutazione> = {}): CondizioniValutazione => ({
  tipoSpazio: 'ENTE',
  origine: 'MANUALE',
  anniContabile: 3,
  senzaBilancio: false,
  ...c,
});

describe('puoValutareCompleta', () => {
  it('con il dato contabile la valutazione parte', () => {
    expect(puoValutareCompleta(base())).toEqual({ puo: true, motivo: null });
  });

  it('senza contabile si ferma e dice che cosa caricare', () => {
    const e = puoValutareCompleta(base({ anniContabile: 0 }));
    expect(e.puo).toBe(false);
    expect(e.motivo).toBe(MESSAGGIO_CONTABILE_MANCANTE);
  });

  it('senza contabile ma con la dichiarazione dell’operatore, parte', () => {
    expect(puoValutareCompleta(base({ anniContabile: 0, senzaBilancio: true })).puo).toBe(true);
  });

  it('la prima elaborazione automatica non chiede il bilancio', () => {
    expect(puoValutareCompleta(base({ origine: 'AUTOMATICA', anniContabile: 0 })).puo).toBe(true);
  });

  it('uno spazio non ente non ha vincoli contabili', () => {
    expect(puoValutareCompleta(base({ tipoSpazio: 'NON_ENTE', anniContabile: 0 })).puo).toBe(true);
  });
});
