// lib/db.ts
//
// Sorgente unica del Pool di connessione. Nel percorso cloud è il Pool di
// 'pg' verso Postgres remoto (DATABASE_URL). Nell'edizione PORTABLE
// (process.env.PORTABLE === '1') è un pool compatibile appoggiato a PGlite
// (Postgres in WASM, in-process, cifrato a riposo) — vedi src/lib/portableDb.
// Le ~230 chiamate pool.query nel resto del codice non cambiano.
import { Pool } from 'pg';
import { portablePool } from './portableDb';
import { sslDatabase } from './edizioneServer';

const PORTABLE = process.env.PORTABLE === '1';

export const pool = (PORTABLE
  ? portablePool
  : new Pool({
      connectionString: process.env.DATABASE_URL,
      // Cloud: TLS; edizione server: DATABASE_SSL=0 (Postgres nella rete interna).
      ssl: sslDatabase(),
      // Un solo pool per processo: ci passano le ~230 query, il DDL delle
      // garanzie e le query tipizzate di Drizzle (src/db/client.ts monta
      // Drizzle su questo stesso Pool). Era il default implicito di `pg`:
      // scritto qui perché il numero di connessioni aperte verso Postgres
      // sia esplicito e non raddoppi senza che nessuno se ne accorga.
      max: 10,
      idleTimeoutMillis: 30_000,
    })) as unknown as Pool;
