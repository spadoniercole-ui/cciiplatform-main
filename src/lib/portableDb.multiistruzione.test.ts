import { describe, it, expect } from 'vitest';
import { contieneMultiIstruzione } from './portableDb';

// Decide se un testo SQL va eseguito con `query` (istruzione singola) o con
// `exec` (più istruzioni). Sbagliare costa caro: dentro una transazione, un
// tentativo fallito con `query` la abortisce, e ogni comando successivo
// risponde "current transaction is aborted", nascondendo l'errore vero.
// È quello che rendeva illeggibile il fallimento del ripristino da backup.

describe('riconoscimento multi-istruzione', () => {
  it('una sola istruzione, con o senza punto e virgola', () => {
    expect(contieneMultiIstruzione('SELECT 1')).toBe(false);
    expect(contieneMultiIstruzione('SELECT 1;')).toBe(false);
    expect(contieneMultiIstruzione('SELECT 1;   \n  ')).toBe(false);
  });

  it('due istruzioni, anche senza punto e virgola finale', () => {
    expect(contieneMultiIstruzione('SELECT 1; SELECT 2;')).toBe(true);
    expect(contieneMultiIstruzione('SELECT 1; SELECT 2')).toBe(true);
  });

  it('un punto e virgola dentro una stringa NON è un separatore', () => {
    // Una ragione sociale con un punto e virgola dentro non deve far
    // scambiare il testo per due istruzioni.
    expect(contieneMultiIstruzione(`INSERT INTO t VALUES ('Alfa; Beta')`)).toBe(false);
    expect(contieneMultiIstruzione(`INSERT INTO t VALUES ('Alfa; Beta');`)).toBe(false);
  });

  it('gli apici raddoppiati dentro una stringa non chiudono la stringa', () => {
    expect(contieneMultiIstruzione(`INSERT INTO t VALUES ('L''Officina; S.r.l.')`)).toBe(false);
  });

  it('un punto e virgola in un commento non è un separatore', () => {
    expect(contieneMultiIstruzione('SELECT 1; -- nota; con punto e virgola\n')).toBe(false);
  });

  it('riconosce uno script di backup vero', () => {
    const script = [
      '-- intestazione; con punto e virgola',
      'CREATE TABLE a (i int);',
      `INSERT INTO a VALUES (1);`,
      `INSERT INTO b (nome) VALUES ('Rossi; Bianchi');`,
    ].join('\n');
    expect(contieneMultiIstruzione(script)).toBe(true);
  });

  it('BEGIN e COMMIT da soli restano istruzione singola', () => {
    expect(contieneMultiIstruzione('BEGIN')).toBe(false);
    expect(contieneMultiIstruzione('ROLLBACK')).toBe(false);
  });
});
