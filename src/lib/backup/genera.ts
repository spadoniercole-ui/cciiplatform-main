// src/lib/backup/genera.ts
//
// Generazione dello script di backup, SEPARATA dal pool di connessione.
//
// Sta qui e non nella Server Action per una ragione pratica: cosi' puo'
// essere eseguita contro QUALUNQUE database, compreso un PGlite temporaneo
// creato apposta in un test. Ed e' l'unico modo di provare davvero che un
// backup funzioni — generarlo, ricaricarlo in un database vuoto e ricontare.
//
// L'accesso al database avviene tramite un `Esecutore`, una funzione che
// riceve SQL e restituisce righe: la Server Action passa il `pool` di
// produzione, il test passa PGlite. Nessuna delle due sa dell'altra.
//
// Nota: la passphrase di CIFRATURA del file e la password di ACCESSO al
// sistema sono cose distinte e non si incontrano mai. Qui non compare
// nessuna delle due: questa funzione produce solo testo SQL.

import {
  quotaIdentificatore as q,
  serializzaValore,
  verificaIntegrita,
  type TabellaInventario,
  type EsitoIntegrita,
} from './formato';

/** Esegue SQL e restituisce le righe. Astrae pool `pg` e PGlite. */
export type Esecutore = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface RisultatoGenerazione {
  sql: string;
  schemi: string[];
  inventario: TabellaInventario[];
  righeTotali: number;
  integrita: EsitoIntegrita;
}

export async function generaScriptBackup(esegui: Esecutore): Promise<RisultatoGenerazione> {
  const parti: string[] = [];
  const inventario: TabellaInventario[] = [];
  const righeScritte = new Map<string, number>();
  const tabelleConDdl = new Set<string>();

  // ---- Schemi ------------------------------------------------------------
  const schemiRows = await esegui(
    `SELECT nspname FROM pg_catalog.pg_namespace
      WHERE nspname = 'public' OR nspname LIKE 'tenant\\_%' ORDER BY nspname`
  );
  const schemi = schemiRows.map((r) => String(r.nspname));

  for (const s of schemi) parti.push(`CREATE SCHEMA IF NOT EXISTS ${q(s)};`);
  parti.push('');

  // ---- Sequenze: CREATE prima delle tabelle ------------------------------
  // I DEFAULT delle colonne SERIAL contengono nextval('schema.tab_id_seq'):
  // se la sequenza non esiste ancora, la CREATE TABLE fallisce. Il valore
  // corrente viene impostato in fondo, a dati caricati.
  parti.push('-- ---------- SEQUENZE (creazione) ----------');
  const sequenzePerSchema = new Map<string, string[]>();
  for (const schema of schemi) {
    const seq = await esegui(
      `SELECT sequencename FROM pg_catalog.pg_sequences WHERE schemaname = $1`,
      [schema]
    );
    const nomi = seq.map((x) => String(x.sequencename));
    sequenzePerSchema.set(schema, nomi);
    for (const nome of nomi) {
      parti.push(`CREATE SEQUENCE IF NOT EXISTS ${q(schema)}.${q(nome)};`);
    }
  }
  parti.push('');

  const tabellePerSchema = new Map<string, string[]>();
  for (const schema of schemi) {
    const t = await esegui(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1 ORDER BY tablename`,
      [schema]
    );
    tabellePerSchema.set(
      schema,
      t.map((x) => String(x.tablename))
    );
  }

  // ---- Struttura ---------------------------------------------------------
  for (const schema of schemi) {
    for (const tabella of tabellePerSchema.get(schema) ?? []) {
      const col = await esegui(
        `SELECT column_name, data_type, character_maximum_length,
                numeric_precision, numeric_scale, is_nullable, column_default, udt_name
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [schema, tabella]
      );

      const colonne = col.map((c) => {
        let tipo = String(c.data_type);
        if (tipo === 'USER-DEFINED' || tipo === 'ARRAY') {
          const u = String(c.udt_name);
          tipo = u.startsWith('_') ? `${u.slice(1)}[]` : u;
        } else if (c.character_maximum_length) {
          tipo = `${tipo}(${c.character_maximum_length})`;
        } else if (tipo === 'numeric' && c.numeric_precision) {
          tipo = `numeric(${c.numeric_precision},${c.numeric_scale ?? 0})`;
        }
        let d = `  ${q(String(c.column_name))} ${tipo}`;
        if (c.column_default) d += ` DEFAULT ${c.column_default}`;
        if (String(c.is_nullable) === 'NO') d += ' NOT NULL';
        return d;
      });

      parti.push(`CREATE TABLE IF NOT EXISTS ${q(schema)}.${q(tabella)} (`);
      parti.push(colonne.join(',\n'));
      parti.push(');');
      tabelleConDdl.add(`${schema}.${tabella}`);
    }
  }
  parti.push('');

  // ---- Dati --------------------------------------------------------------
  let righeTotali = 0;
  parti.push('-- ---------- DATI ----------');
  for (const schema of schemi) {
    for (const tabella of tabellePerSchema.get(schema) ?? []) {
      const chiave = `${schema}.${tabella}`;
      const righe = await esegui(`SELECT * FROM ${q(schema)}.${q(tabella)}`);
      inventario.push({ schema, tabella, righe: righe.length });
      righeTotali += righe.length;

      if (righe.length === 0) {
        righeScritte.set(chiave, 0);
        continue;
      }
      const colonne = Object.keys(righe[0]);
      const elenco = colonne.map((c) => q(c)).join(', ');
      let n = 0;
      for (const riga of righe) {
        const valori = colonne.map((c) => serializzaValore(riga[c]));
        parti.push(
          `INSERT INTO ${q(schema)}.${q(tabella)} (${elenco}) VALUES (${valori.join(', ')});`
        );
        n++;
      }
      righeScritte.set(chiave, n);
    }
  }
  parti.push('');

  // ---- Vincoli, DOPO i dati ---------------------------------------------
  // Prima dei dati, una chiave esterna verso una tabella non ancora popolata
  // farebbe fallire il ripristino a meta'.
  parti.push('-- ---------- VINCOLI ----------');
  for (const schema of schemi) {
    const v = await esegui(
      `SELECT c.conname, c.conrelid::regclass::text AS tabella,
              pg_get_constraintdef(c.oid) AS definizione
         FROM pg_catalog.pg_constraint c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = $1 AND c.conrelid <> 0
        ORDER BY CASE c.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 ELSE 4 END`,
      [schema]
    );
    for (const x of v) {
      parti.push(
        `ALTER TABLE ${x.tabella} ADD CONSTRAINT ${q(String(x.conname))} ${x.definizione};`
      );
    }
  }
  parti.push('');

  // ---- Indici ------------------------------------------------------------
  parti.push('-- ---------- INDICI ----------');
  for (const schema of schemi) {
    const idx = await esegui(`SELECT indexdef FROM pg_catalog.pg_indexes WHERE schemaname = $1`, [
      schema,
    ]);
    for (const i of idx) {
      const def = String(i.indexdef);
      parti.push(`${def.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ')};`);
    }
  }
  parti.push('');

  // ---- Sequenze ----------------------------------------------------------
  // Senza questo i SERIAL ripartono da 1 e la prima insert dopo il ripristino
  // va in conflitto con le righe esistenti.
  parti.push('-- ---------- SEQUENZE (valore corrente) ----------');
  for (const schema of schemi) {
    for (const nome of sequenzePerSchema.get(schema) ?? []) {
      const val = await esegui(`SELECT last_value, is_called FROM ${q(schema)}.${q(nome)}`);
      const lv = val[0]?.last_value ?? 1;
      const called = val[0]?.is_called ?? false;
      parti.push(`SELECT setval('${schema}.${nome}', ${lv}, ${called ? 'true' : 'false'});`);
    }
  }

  return {
    sql: parti.join('\n'),
    schemi,
    inventario,
    righeTotali,
    integrita: verificaIntegrita(inventario, righeScritte, tabelleConDdl),
  };
}
