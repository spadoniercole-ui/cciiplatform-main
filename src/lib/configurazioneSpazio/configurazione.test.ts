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
  CREATE TABLE tenant_x.prodotti_ente (id SERIAL PRIMARY KEY, direttrice TEXT NOT NULL DEFAULT '', nome TEXT NOT NULL DEFAULT '', in_checklist BOOLEAN NOT NULL DEFAULT false, domande JSONB NOT NULL DEFAULT '[]'::jsonb, ordine INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE tenant_x.processo_prodotto (id SERIAL PRIMARY KEY, prodotto_id INTEGER NOT NULL, tl_id INTEGER NOT NULL, esito TEXT, gruppo TEXT, ordine INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE tenant_x.parametri_scenari (id INTEGER PRIMARY KEY DEFAULT 1, costi_procedura_pct NUMERIC);
  CREATE TABLE tenant_x.parametri_scenari_rango (rango TEXT PRIMARY KEY, tasso_liquidazione_pct NUMERIC, cram_down_pct NUMERIC);
  CREATE TABLE tenant_x.vera_voci (sezione_norm TEXT NOT NULL, voce_norm TEXT NOT NULL, sezione TEXT NOT NULL, voce TEXT NOT NULL, materia_id INTEGER NOT NULL, PRIMARY KEY (sezione_norm, voce_norm));
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

  it('porta i prodotti con le domande e il processo operativo, gruppi compresi', async () => {
    const a = await PGlite.create();
    await a.exec(DDL);
    await a.exec(`
      INSERT INTO tenant_x.prodotti_ente (direttrice, nome, in_checklist, domande, ordine)
        VALUES ('RECUPERO CREDITO', 'DIFFIDA', true, '[{"id":"d1","testo":"La diffida è stata ricevuta?"}]', 0),
               ('RECUPERO CREDITO', 'VISURA', false, '[]', 1);
      INSERT INTO tenant_x.processo_prodotto (prodotto_id, tl_id, esito, gruppo, ordine)
        VALUES (1, 81, 'Sì', 'g1', 0), (1, 82, 'Sì', 'g1', 1);
    `);
    const file = JSON.parse(
      JSON.stringify(
        await esportaConfigurazione(esecutore(a), 'tenant_x', {
          codice: 'X',
          tipoSpazio: 'ENTE',
          appVersion: '0.163.0',
          direttriciEnteStrutturate: null,
        })
      )
    );
    expect(file.tabelle.prodotti_ente.righe).toHaveLength(2);

    const b = await PGlite.create();
    await b.exec(DDL);
    const ex = esecutore(b);
    await ex('BEGIN');
    await ripristinaConfigurazione(ex, 'tenant_x', file);
    await ex('COMMIT');

    const prodotti = await ex(
      `SELECT nome, in_checklist, domande FROM tenant_x.prodotti_ente ORDER BY id`
    );
    expect(prodotti).toEqual([
      {
        nome: 'DIFFIDA',
        in_checklist: true,
        domande: [{ id: 'd1', testo: 'La diffida è stata ricevuta?' }],
      },
      { nome: 'VISURA', in_checklist: false, domande: [] },
    ]);
    const processo = await ex(
      `SELECT tl_id, gruppo FROM tenant_x.processo_prodotto ORDER BY tl_id`
    );
    expect(processo).toEqual([
      { tl_id: 81, gruppo: 'g1' },
      { tl_id: 82, gruppo: 'g1' },
    ]);
  }, 60_000);

  it('porta gli scenari del triage e le voci della certificazione, e dichiara le sezioni assenti', async () => {
    const a = await PGlite.create();
    await a.exec(DDL);
    await a.exec(`
      INSERT INTO tenant_x.parametri_scenari (id, costi_procedura_pct) VALUES (1, 1.5);
      INSERT INTO tenant_x.parametri_scenari_rango (rango, tasso_liquidazione_pct, cram_down_pct)
        VALUES ('CHIROGRAFARIO', 12.5, 20);
      INSERT INTO tenant_x.vera_voci (sezione_norm, voce_norm, sezione, voce, materia_id)
        VALUES ('contributi', 'contributi a ruolo', 'Contributi', 'Contributi a ruolo', 3);
    `);
    const file = JSON.parse(
      JSON.stringify(
        await esportaConfigurazione(esecutore(a), 'tenant_x', {
          codice: 'X',
          tipoSpazio: 'ENTE',
          appVersion: '0.164.0',
          direttriciEnteStrutturate: null,
        })
      )
    );
    // Le sezioni che il database non ha non finiscono nel file: è il caso del
    // file salvato con una versione anteriore, e va dichiarato al ripristino.
    expect(Object.keys(file.tabelle)).not.toContain('tl');

    const b = await PGlite.create();
    await b.exec(DDL);
    const ex = esecutore(b);
    await ex('BEGIN');
    const esito = await ripristinaConfigurazione(ex, 'tenant_x', file);
    await ex('COMMIT');

    const scenari = await ex(`SELECT costi_procedura_pct FROM tenant_x.parametri_scenari`);
    expect(Number(scenari[0].costi_procedura_pct)).toBe(1.5);
    const ranghi = await ex(
      `SELECT rango, tasso_liquidazione_pct, cram_down_pct FROM tenant_x.parametri_scenari_rango`
    );
    expect(ranghi).toHaveLength(1);
    expect(Number(ranghi[0].cram_down_pct)).toBe(20);
    expect(await ex(`SELECT materia_id FROM tenant_x.vera_voci`)).toEqual([{ materia_id: 3 }]);
    expect(esito.sezioniAssenti.map((s) => s.nome)).toContain('tl');
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
