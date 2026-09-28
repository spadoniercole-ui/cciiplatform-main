// src/lib/migrazioni/vincoloCheck.ts
//
// Creazione/aggiornamento idempotente di un vincolo CHECK, sicura anche con
// richieste concorrenti.
//
// PERCHÉ. Le tabelle dei tenant si aggiornano a runtime (src/db/provision.ts),
// e una pagina che lancia più richieste in parallelo esegue lo stesso DDL più
// volte nello stesso istante. Il vecchio schema a due istruzioni
//   ALTER TABLE … DROP CONSTRAINT IF EXISTS x;
//   ALTER TABLE … ADD CONSTRAINT x CHECK (…);
// in corsa diventa DROP, DROP, ADD, ADD: la seconda ADD fallisce con
// `constraint "x" … already exists` e con essa l'intera operazione.
//
// COME. Un unico blocco DO (una sola istruzione, quindi atomico):
//   - se il vincolo esiste già con la stessa definizione non fa nulla (e non
//     prende nemmeno il lock esclusivo sulla tabella);
//   - altrimenti lo toglie e lo rimette con la definizione voluta. Il DROP
//     resta perché il vincolo va AGGIORNATO sugli spazi esistenti (es. elenco
//     degli enti ammessi ampliato, campi portati da 5 a 10);
//   - `duplicate_object` di una corsa residua viene ignorato: vuol dire che
//     un'altra richiesta ha appena creato lo stesso vincolo.
//
// "Stessa definizione" si riconosce dal commento del vincolo, che contiene
// l'espressione esatta: confrontare `pg_get_constraintdef` vorrebbe dire
// dipendere dalla forma canonica che Postgres ricostruisce (`IN (…)` diventa
// `= ANY (ARRAY[…])`, parentesi aggiunte…). Un vincolo creato prima di questa
// versione, senza commento, viene ricreato una sola volta.
//
// Solo SQL semplice: funziona su Postgres (cloud) e su PGlite (portable).

const IDENTIFICATORE = /^[a-z0-9_]+$/;
const DELIMITATORE = '$vincolo$';

function letterale(testo: string): string {
  return `'${testo.replace(/'/g, "''")}'`;
}

export function sqlVincoloCheckIdempotente(
  nomeSchema: string,
  tabella: string,
  nomeVincolo: string,
  espressione: string
): string {
  for (const nome of [nomeSchema, tabella, nomeVincolo]) {
    if (!IDENTIFICATORE.test(nome)) throw new Error(`Identificatore non valido: ${nome}`);
  }
  if (espressione.includes(DELIMITATORE)) {
    throw new Error('Espressione del vincolo non valida.');
  }
  const qualificata = `"${nomeSchema}"."${tabella}"`;
  const firma = letterale(espressione);
  return `DO ${DELIMITATORE}
DECLARE
  esistente oid;
BEGIN
  SELECT c.oid INTO esistente
    FROM pg_constraint c
   WHERE c.conname = ${letterale(nomeVincolo)}
     AND c.conrelid = ${letterale(qualificata)}::regclass;
  IF esistente IS NOT NULL
     AND obj_description(esistente, 'pg_constraint') IS NOT DISTINCT FROM ${firma} THEN
    RETURN;
  END IF;
  ALTER TABLE ${qualificata} DROP CONSTRAINT IF EXISTS "${nomeVincolo}";
  ALTER TABLE ${qualificata} ADD CONSTRAINT "${nomeVincolo}" CHECK (${espressione});
  COMMENT ON CONSTRAINT "${nomeVincolo}" ON ${qualificata} IS ${firma};
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
${DELIMITATORE}`;
}
