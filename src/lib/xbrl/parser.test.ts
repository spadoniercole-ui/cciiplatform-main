import { describe, it, expect } from 'vitest';
import { pulisciTag } from './parser';

describe('pulisciTag', () => {
  it('rimuove il prefisso di namespace e mette tutto in minuscolo', () => {
    expect(pulisciTag('itcc-ci:TotaleAttivo')).toBe('totaleattivo');
  });

  it('rimuove caratteri non alfanumerici', () => {
    expect(pulisciTag('itcc-ci:Debiti_Verso-Banche')).toBe('debitiversobanche');
  });

  it('gestisce un tag senza namespace', () => {
    expect(pulisciTag('TotaleAttivo')).toBe('totaleattivo');
  });
});
