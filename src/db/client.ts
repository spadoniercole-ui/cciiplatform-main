import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { portableDrizzle } from '@/lib/portableDb';
import { sslDatabase } from '@/lib/edizioneServer';

// Istanza Drizzle unica. Cloud: driver postgres-js verso Postgres remoto.
// Edizione PORTABLE: Drizzle su PGlite (stessa istanza in-process del Pool),
// pronta dopo l'init all'avvio del server. Il ramo cloud è valutato solo
// quando NON siamo in portable (ternario pigro: nessuna connessione remota
// tentata in locale).
const PORTABLE = process.env.PORTABLE === '1';

export const db = (
  PORTABLE
    ? (portableDrizzle as unknown)
    : drizzle(
        postgres(process.env.DATABASE_URL!, {
          max: 10,
          idle_timeout: 20,
          // Gli avvisi di Postgres (es. "index … does not exist, skipping" dei DROP
          // IF EXISTS idempotenti) non sono errori: non vanno nel log.
          onnotice: () => {},
          // DATABASE_SSL=0 (edizione server): connessione in chiaro come il Pool
          // di src/lib/db.ts. Altrimenti decide lo sslmode dell'URL, come prima.
          ...(sslDatabase() === false ? { ssl: false } : {}),
        })
      )
) as ReturnType<typeof drizzle>;

// AGGIUNTA: Esportiamo la funzione che manca a migrator.ts
export const getDatabaseWorkspace = (workspaceId: string) => {
  // Qui inserisci la logica che ti serve per recuperare il DB di uno specifico workspace.
  // Se al momento non hai logica specifica, puoi restituire semplicemente l'istanza globale:
  return db;
};
