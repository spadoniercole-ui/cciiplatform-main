import { describe, it, expect } from 'vitest';
import { deveEliminareVisura } from './conservazioneVisura';

describe('conservazione della visura dopo lo screening', () => {
  it('la visura trattenuta resta, riuscita o fallita la generazione', () => {
    // È il documento di riferimento dell'azienda: serve per rilanciare lo
    // screening senza ricercarla. La sostituzione con una nuova la elimina.
    expect(deveEliminareVisura(true, true)).toBe(false);
    expect(deveEliminareVisura(false, true)).toBe(false);
  });

  it('un file caricato per la sola operazione si elimina comunque', () => {
    expect(deveEliminareVisura(true, false)).toBe(true);
    expect(deveEliminareVisura(false, false)).toBe(true);
  });
});
