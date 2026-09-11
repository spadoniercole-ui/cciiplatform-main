import { describe, it, expect } from 'vitest';
import { deveEliminareVisura } from './conservazioneVisura';

describe('conservazione della visura dopo lo screening', () => {
  it('generazione riuscita: si elimina sempre', () => {
    // Il documento ha finito il suo lavoro.
    expect(deveEliminareVisura(true, true)).toBe(true);
    expect(deveEliminareVisura(true, false)).toBe(true);
  });

  it('generazione FALLITA sulla visura trattenuta: sopravvive', () => {
    // È il difetto reale: crediti esauriti, e la visura appena fornita nel
    // triage veniva distrutta lo stesso. Si distrugge quando il lavoro è
    // finito, non quando è stato tentato.
    expect(deveEliminareVisura(false, true)).toBe(false);
  });

  it('generazione fallita su un file caricato ORA: si elimina comunque', () => {
    // È stato fornito per questa operazione e non deve sopravviverle:
    // l'operatore ce l'ha ancora sul proprio computer.
    expect(deveEliminareVisura(false, false)).toBe(true);
  });
});
