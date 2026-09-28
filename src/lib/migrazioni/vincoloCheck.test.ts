import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { sqlVincoloCheckIdempotente } from './vincoloCheck';

const ESPRESSIONE = `ente_25novies IS NULL OR ente_25novies IN ('INPS','INAIL','AGENZIA_ENTRATE','AGENZIA_RISCOSSIONE','NON_PUBBLICO')`;

async function databaseDiProva(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(`
    CREATE SCHEMA tenant_prova;
    CREATE TABLE tenant_prova.limiti_ricevibilita (id SERIAL PRIMARY KEY, ente_25novies TEXT);
  `);
  return db;
}

const ddl = () =>
  sqlVincoloCheckIdempotente(
    'tenant_prova',
    'limiti_ricevibilita',
    'ente_25novies_valido',
    ESPRESSIONE
  );

async function vincoli(db: PGlite): Promise<string[]> {
  const r = await db.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname = 'ente_25novies_valido'`
  );
  return r.rows.map((x) => x.def);
}

describe('sqlVincoloCheckIdempotente', () => {
  it('il vecchio DROP+ADD, interleaved come in una corsa, falliva', async () => {
    // Riproduce l'ordine osservato nel log: DROP, DROP, ADD, ADD.
    const db = await databaseDiProva();
    const drop = `ALTER TABLE tenant_prova.limiti_ricevibilita DROP CONSTRAINT IF EXISTS ente_25novies_valido`;
    const add = `ALTER TABLE tenant_prova.limiti_ricevibilita ADD CONSTRAINT ente_25novies_valido CHECK (${ESPRESSIONE})`;
    await db.query(drop);
    await db.query(drop);
    await db.query(add);
    await expect(db.query(add)).rejects.toThrow(/already exists/);
    await db.close();
  });

  it('crea il vincolo, ed eseguito più volte (anche in parallelo) non dà errore', async () => {
    const db = await databaseDiProva();
    await db.query(ddl());
    await db.query(ddl());
    await Promise.all([db.query(ddl()), db.query(ddl()), db.query(ddl())]);
    expect(await vincoli(db)).toHaveLength(1);
    await expect(
      db.query(`INSERT INTO tenant_prova.limiti_ricevibilita (ente_25novies) VALUES ('ALTRO')`)
    ).rejects.toThrow(/ente_25novies_valido/);
    await db.query(
      `INSERT INTO tenant_prova.limiti_ricevibilita (ente_25novies) VALUES ('NON_PUBBLICO'), (NULL)`
    );
    await db.close();
  });

  it('se il vincolo esiste con una definizione vecchia, lo aggiorna', async () => {
    const db = await databaseDiProva();
    // Spazio creato con l'elenco precedente (senza NON_PUBBLICO), senza commento.
    await db.query(
      `ALTER TABLE tenant_prova.limiti_ricevibilita ADD CONSTRAINT ente_25novies_valido
       CHECK (ente_25novies IS NULL OR ente_25novies IN ('INPS','INAIL'))`
    );
    await db.query(ddl());
    const [def] = await vincoli(db);
    expect(def).toContain('NON_PUBBLICO');
    await db.query(
      `INSERT INTO tenant_prova.limiti_ricevibilita (ente_25novies) VALUES ('AGENZIA_ENTRATE')`
    );
    await db.close();
  });

  it('se il vincolo è già aggiornato non lo ricrea', async () => {
    const db = await databaseDiProva();
    await db.query(ddl());
    const prima = await db.query<{ oid: number }>(
      `SELECT oid FROM pg_constraint WHERE conname = 'ente_25novies_valido'`
    );
    await db.query(ddl());
    const dopo = await db.query<{ oid: number }>(
      `SELECT oid FROM pg_constraint WHERE conname = 'ente_25novies_valido'`
    );
    expect(dopo.rows[0].oid).toBe(prima.rows[0].oid);
    await db.close();
  });

  it('rifiuta identificatori non validi', () => {
    expect(() => sqlVincoloCheckIdempotente('x"y', 't', 'v', 'true')).toThrow();
    expect(() => sqlVincoloCheckIdempotente('s', 't', 'v', 'true $vincolo$')).toThrow();
  });
});
