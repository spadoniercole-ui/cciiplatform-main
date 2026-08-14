// lib/db.ts
//
// Sorgente unica del Pool di connessione. Nel percorso cloud è il Pool di
// 'pg' verso Postgres remoto (DATABASE_URL). Nell'edizione PORTABLE
// (process.env.PORTABLE === '1') è un pool compatibile appoggiato a PGlite
// (Postgres in WASM, in-process, cifrato a riposo) — vedi src/lib/portableDb.
// Le ~230 chiamate pool.query nel resto del codice non cambiano.
import { Pool } from 'pg';
import { portablePool } from './portableDb';

const PORTABLE = process.env.PORTABLE === '1';

export const pool = (PORTABLE
  ? portablePool
  : new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })) as unknown as Pool;
