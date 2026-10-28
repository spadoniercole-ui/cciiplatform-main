import { describe, it, expect } from 'vitest';
import { eCorsaDdlBenigna, tabellaMancante } from './corsaDdl';

describe('tabellaMancante', () => {
  it('riconosce undefined_table, anche avvolto da Drizzle', () => {
    expect(tabellaMancante({ code: '42P01' })).toBe(true);
    const avvolto = new Error('Failed query');
    (avvolto as any).cause = { code: '42P01' };
    expect(tabellaMancante(avvolto)).toBe(true);
  });

  it('riconosce il messaggio quando il driver non espone il codice (portable)', () => {
    expect(
      tabellaMancante(new Error('relation "tenant_alfa.consegne_reparti" does not exist'))
    ).toBe(true);
  });

  it('un errore vero non passa per tabella assente', () => {
    expect(tabellaMancante({ code: '23514' })).toBe(false);
    expect(tabellaMancante(new Error('boom'))).toBe(false);
    expect(tabellaMancante(null)).toBe(false);
  });
});

describe('eCorsaDdlBenigna', () => {
  it('"già esistente" (tabella, colonna, vincolo) è benigno', () => {
    expect(eCorsaDdlBenigna({ code: '42P07' })).toBe(true);
    expect(eCorsaDdlBenigna({ code: '42701' })).toBe(true);
    expect(eCorsaDdlBenigna({ code: '42710' })).toBe(true);
  });

  it('duplicato sui cataloghi di sistema: benigno (pg e postgres-js)', () => {
    expect(eCorsaDdlBenigna({ code: '23505', constraint: 'pg_type_typname_nsp_index' })).toBe(true);
    expect(eCorsaDdlBenigna({ code: '23505', constraint_name: 'pg_class_relname_nsp_index' })).toBe(
      true
    );
  });

  it('duplicato su una tabella applicativa (seme, dati): NON benigno', () => {
    expect(eCorsaDdlBenigna({ code: '23505', constraint: 'categorie_tipo_debito_pkey' })).toBe(
      false
    );
    expect(eCorsaDdlBenigna({ code: '23505' })).toBe(false);
  });

  it("riconosce l'errore del driver avvolto da Drizzle in `cause`", () => {
    const avvolto = new Error('Failed query');
    (avvolto as any).cause = { code: '42710', message: 'constraint already exists' };
    expect(eCorsaDdlBenigna(avvolto)).toBe(true);
  });

  it('altri errori vengono rilanciati', () => {
    expect(eCorsaDdlBenigna({ code: '42P01' })).toBe(false); // undefined_table
    expect(eCorsaDdlBenigna({ code: '23514' })).toBe(false); // check_violation
    expect(eCorsaDdlBenigna(new Error('boom'))).toBe(false);
    expect(eCorsaDdlBenigna(null)).toBe(false);
    expect(eCorsaDdlBenigna('stringa')).toBe(false);
  });
});
