import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// La pulizia delle tabelle del Piano-ponte si prova dal percorso VERO:
// `assicuraTabellaAziende`, il DDL che ogni spazio attraversa aprendo le
// aziende. Il caso che conta è un tenant provisionato prima che il Piano-ponte
// uscisse dal codice, con le sue due tabelle ancora nello schema. Serve un
// Postgres vero (PGlite), e ci si arriva passando da Drizzle: si sostituisce
// l'esecutore, non la logica.
const pglite = await PGlite.create();
const dialetto = new PgDialect();

vi.mock('./client', () => ({
  db: {
    execute: async (istruzione: unknown) => {
      const { sql: testo, params } = dialetto.sqlToQuery(istruzione as SQL);
      await pglite.query(testo, params);
    },
  },
}));

// Il Pool di `@/lib/db` non entra in questo percorso (serve a chi legge i dati,
// non al DDL), ma si sostituisce lo stesso: nessuna connessione reale.
vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => pglite.query(testo, parametri) },
}));

const SCHEMA = 'tenant_ponte_prova';

const { assicuraTabellaAziende, dimenticaTabelleGarantite } = await import('./provision');

async function tabellaEsiste(nome: string): Promise<boolean> {
  const esito = await pglite.query<{ t: string | null }>(
    `SELECT to_regclass('${SCHEMA}.${nome}')::text AS t`
  );
  return esito.rows[0].t !== null;
}

async function colonnaEsiste(tabella: string, colonna: string): Promise<boolean> {
  const esito = await pglite.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM information_schema.columns
      WHERE table_schema = '${SCHEMA}' AND table_name = '${tabella}' AND column_name = '${colonna}'`
  );
  return esito.rows[0].n > 0;
}

beforeEach(async () => {
  // La memoria "DDL già garantito" è per processo: si azzera, altrimenti ogni
  // test dopo il primo salterebbe proprio la chiamata che deve provare.
  dimenticaTabelleGarantite();

  await pglite.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};

    -- Lo schema com'era prima della rimozione: aziende senza le colonne
    -- aggiunte dopo, e le due tabelle del Piano-ponte con i loro dati.
    CREATE TABLE ${SCHEMA}.aziende (id SERIAL PRIMARY KEY, ragione_sociale TEXT NOT NULL);
    INSERT INTO ${SCHEMA}.aziende (id, ragione_sociale) VALUES (1, 'Alfa Srl');

    CREATE TABLE ${SCHEMA}.ponte_temporale (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${SCHEMA}.aziende(id) ON DELETE CASCADE,
      data_riferimento DATE NOT NULL,
      stato TEXT NOT NULL DEFAULT 'BOZZA'
    );
    CREATE TABLE ${SCHEMA}.ponte_temporale_eventi (
      id SERIAL PRIMARY KEY,
      ponte_id INTEGER NOT NULL REFERENCES ${SCHEMA}.ponte_temporale(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL
    );
    INSERT INTO ${SCHEMA}.ponte_temporale (azienda_id, data_riferimento, stato)
    VALUES (1, '2026-09-30', 'CONFERMATO');
    INSERT INTO ${SCHEMA}.ponte_temporale_eventi (ponte_id, tipo) VALUES (1, 'CONFERMATO');
  `);
});

describe('assicuraTabellaAziende e le tabelle del Piano-ponte', () => {
  it('le elimina al primo accesso alle aziende, senza toccare il resto', async () => {
    expect(await tabellaEsiste('ponte_temporale')).toBe(true);

    await assicuraTabellaAziende(SCHEMA);

    expect(await tabellaEsiste('ponte_temporale')).toBe(false);
    expect(await tabellaEsiste('ponte_temporale_eventi')).toBe(false);

    // La pulizia sta in coda: se avesse interrotto il percorso, le colonne
    // nuove non ci sarebbero.
    expect(await colonnaEsiste('aziende', 'anno_costituzione')).toBe(true);
    expect(await colonnaEsiste('aziende', 'soglie_aggiornate_al')).toBe(true);

    const aziende = await pglite.query<{ ragione_sociale: string }>(
      `SELECT ragione_sociale FROM ${SCHEMA}.aziende ORDER BY id`
    );
    expect(aziende.rows).toEqual([{ ragione_sociale: 'Alfa Srl' }]);
  });

  it('non solleva su uno spazio nuovo, che il ponte non l’ha mai avuto', async () => {
    await pglite.exec(`
      DROP TABLE ${SCHEMA}.ponte_temporale_eventi;
      DROP TABLE ${SCHEMA}.ponte_temporale;
      DROP TABLE ${SCHEMA}.aziende;
    `);

    await expect(assicuraTabellaAziende(SCHEMA)).resolves.toBeUndefined();

    expect(await tabellaEsiste('aziende')).toBe(true);
    expect(await colonnaEsiste('aziende', 'anno_costituzione')).toBe(true);
  });

  it('riesegue la pulizia dopo che la garanzia è stata dimenticata', async () => {
    // Schema ripristinato o ricreato da un backup: `dimenticaTabelleGarantite`
    // è il segnale che il DDL va rifatto, pulizia compresa.
    await assicuraTabellaAziende(SCHEMA);
    await pglite.exec(`CREATE TABLE ${SCHEMA}.ponte_temporale (id SERIAL PRIMARY KEY)`);
    dimenticaTabelleGarantite(SCHEMA);

    await assicuraTabellaAziende(SCHEMA);

    expect(await tabellaEsiste('ponte_temporale')).toBe(false);
  });
});
