import { describe, it, expect } from 'vitest';
import { LESSICO, cercaTerminiLessico } from './lessico';

describe('lessico controllato (Libra, parte C)', () => {
  it('ha i 19 termini, con identificativi unici e una formula sostitutiva ciascuno', () => {
    expect(LESSICO).toHaveLength(19);
    expect(new Set(LESSICO.map((v) => v.id)).size).toBe(19);
    for (const v of LESSICO) expect(v.formulaSostitutiva.length).toBeGreaterThan(10);
  });

  it('riconosce le flessioni, anche accentate e in maiuscolo', () => {
    const trovati = (t: string) => cercaTerminiLessico(t).map((r) => r.voce.id);
    expect(trovati('Proposta NON RICEVIBILE')).toContain('LEX-RICEVIBILE');
    expect(trovati('verifica di ricevibilità')).toContain('LEX-RICEVIBILE');
    expect(trovati('un piano solido e credibile')).toContain('LEX-SOLIDO');
    expect(trovati('il pavimento minimo è il 30%')).toContain('LEX-PAVIMENTO-MINIMO');
    expect(trovati('La segnalazione è dovuta')).toContain('LEX-SEGNALAZIONE-DOVUTA');
    expect(trovati('la proposta è omologabile')).toContain('LEX-OMOLOGABILE');
    expect(trovati('il cram down fiscale risulta applicabile')).toContain(
      'LEX-CRAM-DOWN-APPLICABILE'
    );
  });

  it('non scambia parole che contengono il termine', () => {
    const trovati = (t: string) => cercaTerminiLessico(t).map((r) => r.voce.id);
    expect(trovati('bilancio consolidato, obbligazione solidale')).not.toContain('LEX-SOLIDO');
    expect(trovati('completamente')).not.toContain('LEX-COMPLETO');
    expect(trovati('conformemente')).not.toContain('LEX-CONFORME');
  });

  it('filtra per classe e restituisce il contesto', () => {
    const r = cercaTerminiLessico('La proposta è ricevibile e conveniente.', {
      classi: ['RISERVATO_PROFESSIONISTA'],
    });
    expect(r.map((x) => x.voce.id)).toEqual(['LEX-CONVENIENTE']);
    expect(r[0].contesto).toContain('conveniente');
  });
});
