import { drizzle } from 'drizzle-orm/node-postgres';
import { portableDrizzle } from '@/lib/portableDb';
import { pool } from '@/lib/db';

// Istanza Drizzle unica. Cloud: Drizzle sullo STESSO `pg.Pool` di
// src/lib/db.ts (driver node-postgres), così le query tipizzate, le letture
// con `pool.query` e il DDL delle garanzie condividono un solo pool di
// connessioni. Prima Drizzle apriva un secondo pool con `postgres.js`
// (max 10): due pool verso lo stesso database, fino a 20 connessioni per
// processo, doppio handshake TLS e avvisi di Postgres che finivano nel log.
// Il DDL passa comunque da `pool.query` (vedi eseguiDdlTenant).
// Edizione PORTABLE: Drizzle su PGlite (stessa istanza in-process del Pool),
// pronta dopo l'init all'avvio del server. Il ramo cloud è valutato solo
// quando NON siamo in portable (ternario pigro: nessuna connessione remota
// tentata in locale).
const PORTABLE = process.env.PORTABLE === '1';

export const db = (PORTABLE ? (portableDrizzle as unknown) : drizzle(pool)) as ReturnType<
  typeof drizzle
>;

// AGGIUNTA: Esportiamo la funzione che manca a migrator.ts
export const getDatabaseWorkspace = (workspaceId: string) => {
  // Qui inserisci la logica che ti serve per recuperare il DB di uno specifico workspace.
  // Se al momento non hai logica specifica, puoi restituire semplicemente l'istanza globale:
  void workspaceId;
  return db;
};
