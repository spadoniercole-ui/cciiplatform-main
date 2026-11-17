import { describe, expect, it } from 'vitest';
import { validaCoerenzaDecisione } from './decisioni';

// La decisione non può contraddire la posizione che annota: un «Proseguire» su
// una posizione bloccata è una traccia che si smentisce da sola.

const bloccata = {
  grado: 'BLOCCATA' as const,
  blocchi: ['La certificazione non quadra con il debito accertato.'],
};

describe('la decisione sta in piedi con la posizione', () => {
  it('vieta di proseguire quando la posizione è bloccata, e dice perché', () => {
    const v = validaCoerenzaDecisione('PROSEGUI', bloccata);
    expect(v.valida).toBe(false);
    expect(v.errore).toContain('bloccata');
    expect(v.errore).toContain('La certificazione non quadra');
  });

  it('lascia decidere gli altri esiti anche su una posizione bloccata', () => {
    for (const esito of ['CHIEDI_DOCUMENTI', 'RIMANDA', 'ARCHIVIA'] as const) {
      expect(validaCoerenzaDecisione(esito, bloccata).valida).toBe(true);
    }
  });

  it('non pone limiti quando la posizione non è bloccata', () => {
    expect(validaCoerenzaDecisione('PROSEGUI', { grado: 'QUASI', blocchi: [] }).valida).toBe(true);
    expect(validaCoerenzaDecisione('PROSEGUI', { grado: 'PRONTA', blocchi: [] }).valida).toBe(true);
  });

  it('lascia all’altra validazione il caso senza esito', () => {
    expect(validaCoerenzaDecisione(undefined, bloccata).valida).toBe(true);
  });
});
