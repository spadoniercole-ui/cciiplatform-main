import { describe, it, expect } from 'vitest';
import { promptCorrezione, scegliVersione, appendiceRilievi } from './correzione';
import { revisionaTesto } from './revisore';

const ORIG =
  'Analisi. '.repeat(30) +
  'La proposta è ricevibile e il piano è solido. ' +
  'Analisi. '.repeat(30);

describe('passata correttiva', () => {
  it('il prompt elenca i rilievi con la regola e la correzione', () => {
    const p = promptCorrezione(ORIG, revisionaTesto(ORIG, 'RELAZIONE_SCENARIO'));
    expect(p).toContain('[REV-020]');
    expect(p).toContain('SOLO le correzioni indicate');
  });
  it('adotta la riscrittura solo se ha meno blocchi e lunghezza compatibile', () => {
    const buona = ORIG.replace(
      'è ricevibile e il piano è solido',
      'è coerente con i parametri configurati e il piano ha dati completi'
    );
    expect(scegliVersione(ORIG, buona, 'RELAZIONE_SCENARIO', null).corretto).toBe(true);
    expect(
      scegliVersione(ORIG, 'Ecco il testo corretto.', 'RELAZIONE_SCENARIO', null).corretto
    ).toBe(false);
    expect(scegliVersione(ORIG, null, 'RELAZIONE_SCENARIO', null).corretto).toBe(false);
  });
  it('i rilievi rimasti finiscono in calce, mai fuori dal documento', () => {
    const a = appendiceRilievi(revisionaTesto(ORIG, 'RELAZIONE_SCENARIO'));
    expect(a).toContain('RILIEVI DEL REVISORE AUTOMATICO NON RISOLTI');
    expect(a).toContain('REV-020');
    expect(
      appendiceRilievi(
        revisionaTesto(
          'Bozza istruttoria soggetta a validazione. Testo pulito.',
          'RELAZIONE_SCENARIO'
        )
      )
    ).toBe('');
  });
});
