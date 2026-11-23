import { describe, expect, it } from 'vitest';
import {
  ETICHETTA_LIVELLO_AZIENDA,
  livelloAziendaValido,
  livelloBasta,
  livelloEffettivo,
  normalizzaLivelloAzienda,
} from './permessiAzienda';

describe('livello per azienda', () => {
  it('accetta solo i due livelli previsti', () => {
    expect(livelloAziendaValido('LETTURA')).toBe(true);
    expect(livelloAziendaValido('SCRITTURA')).toBe(true);
    expect(livelloAziendaValido('NESSUNO')).toBe(false);
    expect(livelloAziendaValido(null)).toBe(false);
  });

  it('legge le associazioni vecchie come «lettura e scrittura»', () => {
    expect(normalizzaLivelloAzienda(null)).toBe('SCRITTURA');
    expect(normalizzaLivelloAzienda(undefined)).toBe('SCRITTURA');
    expect(normalizzaLivelloAzienda('LETTURA')).toBe('LETTURA');
  });

  it('non inventa permessi che il modulo non concede', () => {
    expect(livelloEffettivo('NESSUNO', 'SCRITTURA')).toBe('NESSUNO');
    expect(livelloEffettivo(undefined, 'SCRITTURA')).toBe('NESSUNO');
    expect(livelloEffettivo('LETTURA', 'SCRITTURA')).toBe('LETTURA');
  });

  it('usa il livello dell’azienda come tetto, mai come deroga', () => {
    expect(livelloEffettivo('SCRITTURA', 'LETTURA')).toBe('LETTURA');
    expect(livelloEffettivo('SCRITTURA', 'SCRITTURA')).toBe('SCRITTURA');
    expect(livelloEffettivo('LETTURA', 'LETTURA')).toBe('LETTURA');
  });

  it('dice se il livello effettivo basta per l’operazione', () => {
    expect(livelloBasta('LETTURA', 'LETTURA')).toBe(true);
    expect(livelloBasta('LETTURA', 'SCRITTURA')).toBe(false);
    expect(livelloBasta('SCRITTURA', 'SCRITTURA')).toBe(true);
    expect(livelloBasta('NESSUNO', 'LETTURA')).toBe(false);
  });

  it('ha un’etichetta per ogni livello', () => {
    expect(ETICHETTA_LIVELLO_AZIENDA.LETTURA).toBe('Sola lettura');
    expect(ETICHETTA_LIVELLO_AZIENDA.SCRITTURA).toBe('Lettura e scrittura');
  });
});
