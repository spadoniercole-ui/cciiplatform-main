// src/lib/triage/obbligoVeraSpazio.ts
//
// L'impostazione dell'obbligo del V.E.R.A. vive nello schema del tenant
// (`parametri_triage`, una riga sola) accanto agli altri parametri di spazio.
// Qui la lettura e la scrittura, su un `Esecutore` — come il backup e la
// configurazione di spazio: la Server Action passa un client del pool, un
// test può passare PGlite. La REGOLA, invece, sta in veraObbligatorio.ts ed è
// pura.

import { enteUnicoDaRighe, risolviObbligoVera, type ObbligoVera } from './veraObbligatorio';

export type Esecutore = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

/**
 * Lo stato effettivo dell'obbligo per lo spazio: l'eventuale impostazione
 * salvata e, se non c'è, l'ente dedotto dalle soglie dell'art. 25-novies —
 * la stessa fonte che usano la valutazione delle soglie e l'inquadramento
 * della proposta.
 */
export async function leggiObbligoVera(esegui: Esecutore, schema: string): Promise<ObbligoVera> {
  const enteRighe = await esegui(
    `SELECT DISTINCT ente_25novies FROM ${q(schema)}.limiti_ricevibilita
      WHERE ente_25novies IS NOT NULL`
  ).catch(() => [] as Record<string, unknown>[]);
  const ente = enteUnicoDaRighe(enteRighe as { ente_25novies: string | null }[]);

  const r = await esegui(
    `SELECT vera_obbligatorio FROM ${q(schema)}.parametri_triage WHERE id = 1`
  );
  const grezzo = r[0]?.vera_obbligatorio;
  // NULL in tabella = automatico: si torna a seguire l'ente.
  const impostazione = typeof grezzo === 'boolean' ? grezzo : null;
  return risolviObbligoVera(impostazione, ente);
}

/**
 * Salva la scelta. `null` riporta l'obbligo all'automatico (segue l'ente):
 * un valore salvato, anche quando coincide con quello dell'ente, resta
 * un'impostazione — e la scheda lo dice, perché il giorno che l'ente cambia
 * la scelta non cambia con lui.
 */
export async function scriviObbligoVera(
  esegui: Esecutore,
  schema: string,
  valore: boolean | null
): Promise<ObbligoVera> {
  await esegui(
    `INSERT INTO ${q(schema)}.parametri_triage (id, vera_obbligatorio) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET vera_obbligatorio = EXCLUDED.vera_obbligatorio`,
    [valore]
  );
  return leggiObbligoVera(esegui, schema);
}
