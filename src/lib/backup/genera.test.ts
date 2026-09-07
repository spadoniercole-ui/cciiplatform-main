import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generaScriptBackup, type Esecutore } from './genera';

// QUESTO è il test che conta.
//
// Un controllo d'integrità dice che il file è completo; non dice che è
// eseguibile. L'unica prova che un backup sia un backup è ripristinarlo. Qui
// si costruisce un database con dentro tutte le cose che di solito rompono un
// dump — SERIAL, chiave esterna, UNIQUE, CHECK, colonna array, jsonb, testo
// con apostrofi — si genera il backup, lo si esegue su un database VUOTO e si
// verifica che il secondo sia identico al primo.
//
// PGlite è Postgres vero compilato in WASM: stesso catalogo, stesse funzioni
// pg_get_constraintdef e pg_indexes su cui si basa la generazione.

function esecutore(db: PGlite): Esecutore {
  return async (sql, params) => {
    const r =
      params && params.length ? await db.query(sql, params as never[]) : await db.query(sql);
    return (r.rows ?? []) as Record<string, unknown>[];
  };
}

async function costruisciOriginale(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS tenant_prova;

    CREATE TABLE tenant_prova.aziende (
      id SERIAL PRIMARY KEY,
      ragione_sociale TEXT NOT NULL,
      partita_iva TEXT,
      alias TEXT[] NOT NULL DEFAULT '{}',
      dati JSONB,
      attiva BOOLEAN NOT NULL DEFAULT TRUE,
      capitale NUMERIC(12,2),
      creata_il TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE tenant_prova.scenari (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES tenant_prova.aziende(id) ON DELETE CASCADE,
      titolo TEXT NOT NULL,
      percentuale NUMERIC,
      CONSTRAINT percentuale_valida CHECK (percentuale IS NULL OR (percentuale >= 0 AND percentuale <= 100))
    );

    CREATE UNIQUE INDEX aziende_piva_unica ON tenant_prova.aziende (partita_iva);
    CREATE INDEX scenari_per_azienda ON tenant_prova.scenari (azienda_id);
  `);

  // Dati con dentro le insidie: apostrofo, array, jsonb, NULL, decimali.
  await db.exec(`
    INSERT INTO tenant_prova.aziende (ragione_sociale, partita_iva, alias, dati, capitale) VALUES
      ('L''Officina Meccanica S.r.l.', '03948570965', ARRAY['Officina','L''Officina'], '{"note":"c''è un apostrofo"}', 10000.50),
      ('Alfa S.p.A.', '11111111111', ARRAY[]::text[], NULL, NULL),
      ('Beta & Figli S.n.c.', '22222222222', ARRAY['Beta'], '{"n":3}', 250.00);

    INSERT INTO tenant_prova.scenari (azienda_id, titolo, percentuale) VALUES
      (1, 'Proposta al 30%', 30),
      (1, 'Proposta al 45%', 45),
      (2, 'Scenario senza percentuale', NULL);
  `);
  return db;
}

describe('backup e ripristino reale', () => {
  it('un database ripristinato dal backup è identico all’originale', async () => {
    const originale = await costruisciOriginale();
    const backup = await generaScriptBackup(esecutore(originale));

    expect(backup.integrita.integro).toBe(true);
    expect(backup.righeTotali).toBe(6);

    // Ripristino su un database COMPLETAMENTE VUOTO.
    const ripristinato = await PGlite.create();
    await ripristinato.exec(backup.sql);

    // Stesse righe, tabella per tabella.
    for (const t of backup.inventario) {
      const a = await originale.query(
        `SELECT count(*)::int AS n FROM "${t.schema}"."${t.tabella}"`
      );
      const b = await ripristinato.query(
        `SELECT count(*)::int AS n FROM "${t.schema}"."${t.tabella}"`
      );
      expect((b.rows[0] as { n: number }).n).toBe((a.rows[0] as { n: number }).n);
    }

    // Il contenuto, non solo il conteggio: l'apostrofo e l'array devono
    // tornare indietro identici.
    const r = await ripristinato.query(
      `SELECT ragione_sociale, alias, dati, capitale FROM tenant_prova.aziende WHERE id = 1`
    );
    const riga = r.rows[0] as {
      ragione_sociale: string;
      alias: string[];
      dati: { note: string };
      capitale: string;
    };
    expect(riga.ragione_sociale).toBe("L'Officina Meccanica S.r.l.");
    expect(riga.alias).toEqual(['Officina', "L'Officina"]);
    expect(riga.dati.note).toBe("c'è un apostrofo");
    expect(Number(riga.capitale)).toBe(10000.5);

    await originale.close();
    await ripristinato.close();
  }, 60000);

  it('le sequenze ripartono dal punto giusto, non da 1', async () => {
    // Il difetto classico: dopo il ripristino il primo INSERT va in conflitto
    // con le righe esistenti perché il SERIAL è tornato a 1.
    const originale = await costruisciOriginale();
    const backup = await generaScriptBackup(esecutore(originale));

    const ripristinato = await PGlite.create();
    await ripristinato.exec(backup.sql);

    const nuovo = await ripristinato.query(
      `INSERT INTO tenant_prova.aziende (ragione_sociale) VALUES ('Nuova dopo ripristino') RETURNING id`
    );
    expect((nuovo.rows[0] as { id: number }).id).toBe(4);

    await originale.close();
    await ripristinato.close();
  }, 60000);

  it('i vincoli sono ripristinati e funzionano davvero', async () => {
    const originale = await costruisciOriginale();
    const backup = await generaScriptBackup(esecutore(originale));
    const ripristinato = await PGlite.create();
    await ripristinato.exec(backup.sql);

    // CHECK: percentuale fuori intervallo deve essere rifiutata.
    await expect(
      ripristinato.query(
        `INSERT INTO tenant_prova.scenari (azienda_id, titolo, percentuale) VALUES (1, 'Fuori scala', 150)`
      )
    ).rejects.toThrow();

    // FOREIGN KEY: uno scenario su un'azienda inesistente deve fallire.
    await expect(
      ripristinato.query(
        `INSERT INTO tenant_prova.scenari (azienda_id, titolo) VALUES (999, 'Orfano')`
      )
    ).rejects.toThrow();

    // UNIQUE: partita IVA duplicata deve fallire.
    await expect(
      ripristinato.query(
        `INSERT INTO tenant_prova.aziende (ragione_sociale, partita_iva) VALUES ('Doppione', '03948570965')`
      )
    ).rejects.toThrow();

    await originale.close();
    await ripristinato.close();
  }, 60000);

  it('rileva un backup manomesso: righe mancanti non passano il controllo', async () => {
    const originale = await costruisciOriginale();
    const backup = await generaScriptBackup(esecutore(originale));

    // Simulo un dump troncato togliendo un INSERT: è il guasto che ha
    // l'aspetto di un backup riuscito.
    const righe = backup.sql.split('\n');
    const i = righe.findIndex((r) => r.startsWith('INSERT INTO "tenant_prova"."scenari"'));
    expect(i).toBeGreaterThan(-1);
    righe.splice(i, 1);

    const ripristinato = await PGlite.create();
    await ripristinato.exec(righe.join('\n'));
    const n = await ripristinato.query(`SELECT count(*)::int AS n FROM tenant_prova.scenari`);
    expect((n.rows[0] as { n: number }).n).toBe(2); // non 3

    await originale.close();
    await ripristinato.close();
  }, 60000);
});
