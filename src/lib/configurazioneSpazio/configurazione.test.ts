import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  esportaConfigurazione,
  ripristinaConfigurazione,
  validaFileConfigurazione,
  type Esecutore,
} from './configurazione';

function esecutore(db: PGlite): Esecutore {
  return async (sql, params) => {
    const r =
      params && params.length ? await db.query(sql, params as never[]) : await db.query(sql);
    return (r.rows ?? []) as Record<string, unknown>[];
  };
}

const DDL = `
  CREATE SCHEMA tenant_x;
  CREATE TABLE tenant_x.materie_ente (id SERIAL PRIMARY KEY, nome TEXT UNIQUE NOT NULL, proposta JSONB);
  CREATE TABLE tenant_x.titoli_ente (id SERIAL PRIMARY KEY, codice TEXT UNIQUE NOT NULL, atto TEXT, materia_id INTEGER);
  CREATE TABLE tenant_x.limiti_ricevibilita (id SERIAL PRIMARY KEY, categoria_creditore TEXT UNIQUE, percentuale_minima NUMERIC, alias TEXT[] NOT NULL DEFAULT '{}');
  CREATE TABLE tenant_x.titoli_ente_config (id INTEGER PRIMARY KEY, dominio_ente TEXT, lotto_ricerca_id TEXT);
  CREATE TABLE tenant_x.checklist_modelli (id SERIAL PRIMARY KEY, nome TEXT, sezioni JSONB);
`;

describe('configurazione dello spazio: esporta e ripristina', () => {
  it('ripristina su un database vuoto, con id, jsonb, array e sequenze', async () => {
    const a = await PGlite.create();
    await a.exec(DDL);
    await a.exec(`
      INSERT INTO tenant_x.materie_ente (nome, proposta) VALUES ('FLUSSI UNIEMENS', '{"sintesi":"l''ente"}'), ('NOTE DI RETTIFICA', NULL);
      DELETE FROM tenant_x.materie_ente WHERE id = 1;
      INSERT INTO tenant_x.materie_ente (nome) VALUES ('FLUSSI UNIEMENS');
      INSERT INTO tenant_x.titoli_ente (codice, atto, materia_id) VALUES ('27', 'Flusso non versato', 3);
      INSERT INTO tenant_x.limiti_ricevibilita (categoria_creditore, percentuale_minima, alias) VALUES ('INPS', 50, ARRAY['previdenziale','inps']);
      INSERT INTO tenant_x.titoli_ente_config VALUES (1, 'inps.it', 'lotto-in-corso');
      INSERT INTO tenant_x.checklist_modelli (nome, sezioni) VALUES ('Base', '[{"titolo":"A"}]');
    `);
    const file = await esportaConfigurazione(esecutore(a), 'tenant_x', {
      codice: 'X',
      tipoSpazio: 'ENTE',
      appVersion: '0.119.0',
      direttriciEnteStrutturate: [{ nome: 'D1' }],
    });
    expect(file.tabelle.titoli_ente_config.righe[0]).not.toHaveProperty('lotto_ricerca_id');

    // Passa per JSON come il file vero.
    const letto = JSON.parse(JSON.stringify(file));
    expect(validaFileConfigurazione(letto)).toBeNull();

    const b = await PGlite.create();
    await b.exec(DDL);
    await b.exec(
      `INSERT INTO tenant_x.limiti_ricevibilita (categoria_creditore) VALUES ('DA CANCELLARE');`
    );
    const ex = esecutore(b);
    await ex('BEGIN');
    const esito = await ripristinaConfigurazione(ex, 'tenant_x', letto);
    await ex('COMMIT');

    expect(esito.tabelle.find((t) => t.nome === 'materie_ente')?.righe).toBe(2);
    const titolo = (
      await ex(
        `SELECT t.codice, m.nome FROM tenant_x.titoli_ente t JOIN tenant_x.materie_ente m ON m.id = t.materia_id`
      )
    )[0];
    expect(titolo).toEqual({ codice: '27', nome: 'FLUSSI UNIEMENS' });
    const lim = await ex(`SELECT categoria_creditore, alias FROM tenant_x.limiti_ricevibilita`);
    expect(lim).toEqual([{ categoria_creditore: 'INPS', alias: ['previdenziale', 'inps'] }]);
    const mod = (await ex(`SELECT sezioni FROM tenant_x.checklist_modelli`))[0];
    expect(mod.sezioni).toEqual([{ titolo: 'A' }]);
    const m = (
      await ex(`SELECT proposta FROM tenant_x.materie_ente WHERE nome = 'NOTE DI RETTIFICA'`)
    )[0];
    expect(m.proposta).toBeNull();
    // La sequenza riparte dopo l'id più alto conservato.
    const nuovo = (
      await ex(`INSERT INTO tenant_x.materie_ente (nome) VALUES ('DIFFIDE') RETURNING id`)
    )[0];
    expect(nuovo.id).toBe(4);
  }, 60_000);

  it('rifiuta file estranei o di versioni future', () => {
    expect(validaFileConfigurazione({ formato: 'altro' })).toMatch(/non è una configurazione/);
    expect(
      validaFileConfigurazione({
        formato: 'CCIIPLATFORM_CONFIGURAZIONE_SPAZIO',
        versione: 99,
        tabelle: {},
      })
    ).toMatch(/più recente/);
  });

  it('ignora colonne che il database di arrivo non ha', async () => {
    const b = await PGlite.create();
    await b.exec(DDL);
    const ex = esecutore(b);
    const esito = await ripristinaConfigurazione(ex, 'tenant_x', {
      formato: 'CCIIPLATFORM_CONFIGURAZIONE_SPAZIO',
      versione: 1,
      appVersion: 'x',
      esportatoIl: 'x',
      spazio: { codice: 'X', tipoSpazio: 'ENTE' },
      globale: { direttriciEnteStrutturate: null },
      tabelle: { titoli_ente: { righe: [{ id: 1, codice: '25', colonna_futura: 'z' }] } },
    });
    expect(esito.colonneIgnorate).toEqual(['titoli_ente.colonna_futura']);
  }, 60_000);
});
