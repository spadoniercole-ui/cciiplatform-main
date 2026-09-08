import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generaScriptBackup, type Esecutore } from './genera';
import { leggiBackup, rimuoviTransazione } from './leggi';
import { intestazione } from './formato';

// Il ciclo completo, su database veri: si costruisce, si fa il backup, si
// AZZERA, si ripristina, e si verifica che tutto sia tornato.
//
// È la prova che mancava. Un backup verificato solo alla generazione dimostra
// di essere completo; solo il ciclo intero dimostra che serva a qualcosa.

function esecutore(db: PGlite): Esecutore {
  return async (sql, params) => {
    const r =
      params && params.length ? await db.query(sql, params as never[]) : await db.query(sql);
    return (r.rows ?? []) as Record<string, unknown>[];
  };
}

async function popolato(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS tenant_uno;
    CREATE TABLE tenant_uno.aziende (
      id SERIAL PRIMARY KEY,
      ragione_sociale TEXT NOT NULL,
      alias TEXT[] NOT NULL DEFAULT '{}',
      dati JSONB
    );
    CREATE TABLE tenant_uno.scenari (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES tenant_uno.aziende(id) ON DELETE CASCADE,
      titolo TEXT NOT NULL
    );
    INSERT INTO tenant_uno.aziende (ragione_sociale, alias, dati) VALUES
      ('L''Officina S.r.l.', ARRAY['Officina'], '{"k":1}'),
      ('Alfa S.p.A.', '{}', NULL);
    INSERT INTO tenant_uno.scenari (azienda_id, titolo) VALUES
      (1, 'Primo scenario'), (1, 'Secondo'), (2, 'Terzo');
  `);
  return db;
}

/** Riproduce ciò che fa la Server Action: intestazione + BEGIN/COMMIT. */
async function fileDiBackup(db: PGlite) {
  const g = await generaScriptBackup(esecutore(db));
  const testo =
    intestazione({
      versioneApp: '0.109.35',
      generatoIl: new Date().toISOString(),
      schemi: g.schemi.length,
      tabelle: g.inventario.length,
      righe: g.righeTotali,
      cifrato: false,
    }) +
    'BEGIN;\n\n' +
    g.sql +
    '\n\nCOMMIT;\n';
  return { testo, g };
}

describe('ciclo completo: backup → azzeramento → ripristino', () => {
  it('il database torna esattamente com’era', async () => {
    const originale = await popolato();
    const { testo } = await fileDiBackup(originale);

    // Il file prodotto deve superare la validazione che precede il ripristino.
    const validazione = leggiBackup(testo);
    expect(validazione.valido).toBe(true);
    expect(validazione.problemi).toEqual([]);

    // AZZERAMENTO: stessa logica dell'action (DROP SCHEMA CASCADE + DROP
    // TABLE su public), sullo stesso database che poi si ripristina.
    const schemi = await originale.query<{ nspname: string }>(
      `SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname LIKE 'tenant\\_%'`
    );
    for (const s of schemi.rows)
      await originale.exec(`DROP SCHEMA IF EXISTS "${s.nspname}" CASCADE`);
    const tab = await originale.query<{ tablename: string }>(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
    );
    for (const t of tab.rows)
      await originale.exec(`DROP TABLE IF EXISTS "public"."${t.tablename}" CASCADE`);

    // Vuoto davvero.
    const dopoAzzeramento = await originale.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_catalog.pg_tables WHERE schemaname LIKE 'tenant\\_%'`
    );
    expect(dopoAzzeramento.rows[0].n).toBe(0);

    // RIPRISTINO sullo stesso database appena svuotato.
    await originale.exec(testo);

    const aziende = await originale.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tenant_uno.aziende`
    );
    const scenari = await originale.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tenant_uno.scenari`
    );
    expect(aziende.rows[0].n).toBe(2);
    expect(scenari.rows[0].n).toBe(3);

    // Il contenuto, non solo i conteggi.
    const r = await originale.query<{ ragione_sociale: string; alias: string[] }>(
      `SELECT ragione_sociale, alias FROM tenant_uno.aziende WHERE id = 1`
    );
    expect(r.rows[0].ragione_sociale).toBe("L'Officina S.r.l.");
    expect(r.rows[0].alias).toEqual(['Officina']);

    // E il database ripristinato deve essere OPERATIVO, non solo popolato.
    const nuovo = await originale.query<{ id: number }>(
      `INSERT INTO tenant_uno.aziende (ragione_sociale) VALUES ('Dopo il ripristino') RETURNING id`
    );
    expect(nuovo.rows[0].id).toBe(3);

    await originale.close();
  }, 90000);

  it('un backup di un database ripristinato è identico al primo', async () => {
    // Se il secondo giro producesse qualcosa di diverso, vorrebbe dire che il
    // ripristino perde per strada qualcosa che non si vede a occhio.
    const db = await popolato();
    const primo = await fileDiBackup(db);

    const schemi = await db.query<{ nspname: string }>(
      `SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname LIKE 'tenant\\_%'`
    );
    for (const s of schemi.rows) await db.exec(`DROP SCHEMA IF EXISTS "${s.nspname}" CASCADE`);
    await db.exec(primo.testo);

    const secondo = await fileDiBackup(db);
    expect(secondo.g.inventario.length).toBe(primo.g.inventario.length);
    expect(secondo.g.righeTotali).toBe(primo.g.righeTotali);
    expect(secondo.g.integrita.integro).toBe(true);

    await db.close();
  }, 90000);

  it('un file troncato viene fermato PRIMA di azzerare', async () => {
    const db = await popolato();
    const { testo } = await fileDiBackup(db);
    const troncato = testo.slice(0, Math.floor(testo.length * 0.7));

    const esito = leggiBackup(troncato);
    expect(esito.valido).toBe(false);

    // Il database non è stato toccato: i dati ci sono ancora.
    const n = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM tenant_uno.aziende`);
    expect(n.rows[0].n).toBe(2);

    await db.close();
  }, 90000);
});

describe('prova a vuoto tramite transazione annullata', () => {
  // È il meccanismo che ha sostituito il PGlite temporaneo, e il punto in cui
  // un errore sarebbe catastrofico: se il ROLLBACK non tenesse, la "prova"
  // cancellerebbe il database invece di simularne la cancellazione.

  it('esegue cancellazione e ripristino, poi ANNULLA tutto', async () => {
    const db = await popolato();
    const { testo } = await fileDiBackup(db);
    const script = rimuoviTransazione(testo);

    await db.exec('BEGIN');
    // cancellazione, come fa l'action
    const schemi = await db.query<{ nspname: string }>(
      `SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname LIKE 'tenant\\_%'`
    );
    for (const s of schemi.rows) await db.exec(`DROP SCHEMA IF EXISTS "${s.nspname}" CASCADE`);
    await db.exec(script);

    // Dentro la transazione il ripristino è avvenuto.
    const dentro = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tenant_uno.aziende`
    );
    expect(dentro.rows[0].n).toBe(2);

    await db.exec('ROLLBACK');

    // Fuori, tutto com'era: i dati originali, non quelli ripristinati.
    const dopo = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM tenant_uno.aziende`);
    expect(dopo.rows[0].n).toBe(2);
    const scenari = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tenant_uno.scenari`
    );
    expect(scenari.rows[0].n).toBe(3);

    await db.close();
  }, 90000);

  it('un file difettoso lascia il database intatto dopo il ROLLBACK', async () => {
    const db = await popolato();
    const rotto = 'CREATE TABLE tenant_uno.x (i int);\nQUESTA NON E SQL;';

    await db.exec('BEGIN');
    const schemi = await db.query<{ nspname: string }>(
      `SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname LIKE 'tenant\\_%'`
    );
    for (const s of schemi.rows) await db.exec(`DROP SCHEMA IF EXISTS "${s.nspname}" CASCADE`);
    await expect(db.exec(rotto)).rejects.toThrow();
    await db.exec('ROLLBACK');

    // Lo schema cancellato dentro la transazione è tornato.
    const dopo = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM tenant_uno.aziende`);
    expect(dopo.rows[0].n).toBe(2);

    await db.close();
  }, 90000);

  it('senza rimuoviTransazione, il COMMIT dello script renderebbe definitiva la cancellazione', async () => {
    // Questo test documenta PERCHÉ rimuoviTransazione esiste. Si esegue lo
    // script COL suo COMMIT: quel COMMIT chiude la nostra transazione, e il
    // ROLLBACK successivo non ha più nulla da annullare.
    const db = await popolato();
    const { testo } = await fileDiBackup(db);

    await db.exec('BEGIN');
    await db.exec(`DROP SCHEMA IF EXISTS "tenant_uno" CASCADE`);
    await db.exec(testo); // NON ripulito: contiene BEGIN e COMMIT
    await db.exec('ROLLBACK');

    // Il ripristino è rimasto: la transazione era già stata chiusa dal COMMIT
    // interno. Se qui il ripristino fosse fallito, i dati sarebbero perduti.
    const dopo = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM tenant_uno.aziende`);
    expect(dopo.rows[0].n).toBe(2);

    await db.close();
  }, 90000);
});
