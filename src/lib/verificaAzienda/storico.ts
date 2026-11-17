// LO STORICO DELLE VERIFICHE, CON RIPIEGO (0.244.1).
//
// La pagina della Posizione legge le verifiche eseguite con autore e modalità.
// Le due colonne arrivano con `assicuraTabellaAziende`, ma questa lettura non
// la invoca: su uno spazio creato prima e non ancora riallineato la query con
// `verifica_eseguita_da_modalita` fallisce. Prima l'errore diventava zero righe:
// la posizione sembrava mai verificata, che è la conclusione peggiore perché è
// falsa e plausibile.
//
// Qui sta la regola: si legge con le colonne dell'autore; se la lettura non
// riesce, si rilegge senza. Le righe restano, l'autore manca e la pagina lo
// dichiara. Solo se falliscono entrambe si torna vuoti, come prima.

import { pool } from '@/lib/db';

/** Basta il Pool di `pg` o un PGlite nei test. */
export type EsecutoreStorico = {
  query: (sql: string, valori?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

export function selezionaStorico(nomeSchema: string, conAutore: boolean): string {
  return `SELECT id, ragione_sociale, partita_iva, verifica_esito, verifica_eseguita_il,
          ${conAutore ? 'verifica_eseguita_da, verifica_eseguita_da_modalita,' : ''}
          in_verifica, verifica_archiviata, verifica_motivo
     FROM "${nomeSchema}".aziende
    WHERE verifica_eseguita_il IS NOT NULL
    ORDER BY verifica_eseguita_il DESC`;
}

export async function leggiRigheStorico(
  nomeSchema: string,
  db: EsecutoreStorico = pool
): Promise<Record<string, unknown>[]> {
  if (!schemaOk(nomeSchema)) return [];
  return db
    .query(selezionaStorico(nomeSchema, true))
    .then((r) => r.rows)
    .catch(() => db.query(selezionaStorico(nomeSchema, false)).then((r) => r.rows))
    .catch(() => []);
}
