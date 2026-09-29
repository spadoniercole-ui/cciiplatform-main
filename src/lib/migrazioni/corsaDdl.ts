// src/lib/migrazioni/corsaDdl.ts
//
// Riconosce gli errori di una corsa concorrente BENIGNA sul DDL a runtime dei
// tenant: due richieste parallele creano lo stesso oggetto nello stesso
// istante e la seconda trova il lavoro già fatto. Stesso criterio di
// src/db/ensureTables.ts, con una restrizione in più: il duplicato di chiave
// (23505) è benigno solo sugli indici dei CATALOGHI di sistema (pg_type,
// pg_class…), come accade con due CREATE TABLE/INDEX IF NOT EXISTS
// simultanei. Un 23505 su una tabella applicativa (un seme o una migrazione
// dati) resta un errore vero e va rilanciato.

const GIA_ESISTENTE = new Set([
  '42P07', // duplicate_table
  '42701', // duplicate_column
  '42710', // duplicate_object (vincolo, indice… già presente)
]);

interface ErrorePostgres {
  code?: unknown;
  constraint?: unknown; // pg, PGlite
  constraint_name?: unknown; // postgres-js
  cause?: unknown; // Drizzle avvolge l'errore del driver in `cause`
}

function erroreDriver(error: unknown): ErrorePostgres | null {
  let e: unknown = error;
  // Si scende al più di qualche livello di `cause` cercando un codice SQLSTATE.
  for (let i = 0; i < 4 && e && typeof e === 'object'; i++) {
    const candidato = e as ErrorePostgres;
    if (typeof candidato.code === 'string' && /^[0-9A-Z]{5}$/.test(candidato.code)) {
      return candidato;
    }
    e = candidato.cause;
  }
  return null;
}

export function eCorsaDdlBenigna(error: unknown): boolean {
  const e = erroreDriver(error);
  if (!e) return false;
  const codice = e.code as string;
  if (GIA_ESISTENTE.has(codice)) return true;
  if (codice === '23505') {
    const vincolo = e.constraint ?? e.constraint_name;
    return typeof vincolo === 'string' && vincolo.startsWith('pg_');
  }
  return false;
}
