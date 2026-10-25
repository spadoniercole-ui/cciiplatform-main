// src/lib/migrazioni/chiaveEsterna.ts
//
// Aggiornamento idempotente di una chiave esterna, sicuro anche con richieste
// concorrenti.
//
// PERCHÉ. Le tabelle dei tenant si aggiornano a runtime (src/db/provision.ts),
// e lo stesso DDL gira a ogni chiamata. Il vecchio schema a due istruzioni
//   ALTER TABLE … DROP CONSTRAINT IF EXISTS x;
//   ALTER TABLE … ADD CONSTRAINT x FOREIGN KEY …;
// in corsa diventa DROP, DROP, ADD, ADD: la seconda ADD fallisce con
// `constraint "x" … already exists`. E il DROP per nome non funziona nemmeno
// quando il vincolo è stato creato automaticamente da Postgres, che lo chiama
// `<tabella>_<colonna>_fkey`: il nome non è nel nostro codice.
//
// COME. Un unico blocco DO (una sola istruzione, quindi atomico) che:
//   - rende la colonna nullabile quando l'azione è SET NULL;
//   - guarda le chiavi esterne sulla colonna, qualunque sia il loro nome, e
//     legge dal COMMENTO del vincolo la definizione voluta (confrontare
//     `pg_get_constraintdef` vorrebbe dire dipendere dalla forma canonica che
//     Postgres ricostruisce: spazi, ordinamento dei token…). Se è già quella,
//     non tocca niente e non prende il lock esclusivo;
//   - altrimenti toglie le chiavi esterne presenti su quella colonna e ne
//     aggiunge una con nome proprio e l'azione voluta;
//   - una corsa residua (`duplicate_object`) viene ignorata.
//
// Solo SQL semplice: funziona su Postgres (cloud e server) e su PGlite
// (portable).

const IDENTIFICATORE = /^[a-z0-9_]+$/;
const DELIMITATORE = '$fk$';

export type AzioneCancellazione = 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';

export interface OpzioniChiaveEsterna {
  nomeSchema: string;
  tabella: string;
  /** Colonna (o colonne) della tabella che porta la chiave. */
  colonne: string[];
  schemaRiferito: string;
  tabellaRiferita: string;
  colonneRiferite: string[];
  /** Che cosa fa Postgres alla riga quando la riga riferita viene cancellata. */
  azione: AzioneCancellazione;
  /** Nome del vincolo che questa funzione crea. */
  nomeVincolo: string;
}

function letterale(testo: string): string {
  return `'${testo.replace(/'/g, "''")}'`;
}

function identificatore(nome: string): string {
  if (!IDENTIFICATORE.test(nome)) throw new Error(`Identificatore non valido: ${nome}`);
  return `"${nome}"`;
}

export function sqlChiaveEsternaIdempotente(opzioni: OpzioniChiaveEsterna): string {
  const {
    nomeSchema,
    tabella,
    colonne,
    schemaRiferito,
    tabellaRiferita,
    colonneRiferite,
    azione,
    nomeVincolo,
  } = opzioni;
  if (colonne.length === 0 || colonne.length !== colonneRiferite.length) {
    throw new Error(
      'La chiave esterna deve avere lo stesso numero di colonne da entrambe le parti.'
    );
  }

  const q = `${identificatore(nomeSchema)}.${identificatore(tabella)}`;
  const riferita = `${identificatore(schemaRiferito)}.${identificatore(tabellaRiferita)}`;
  const colonneSql = colonne.map(identificatore).join(', ');
  const riferiteSql = colonneRiferite.map(identificatore).join(', ');
  const primaColonna = colonne[0];
  const vincolo = identificatore(nomeVincolo);

  // La firma sta nel commento del vincolo: è il confronto che rende il blocco
  // silenzioso quando non c'è nulla da cambiare.
  const firma = letterale(
    `FOREIGN KEY (${colonneSql}) REFERENCES ${riferita} (${riferiteSql}) ON DELETE ${azione}`
  );
  const tabellaRegclass = `${letterale(q)}::regclass`;
  const nullabile =
    azione === 'SET NULL'
      ? `  ALTER TABLE ${q} ALTER COLUMN ${identificatore(primaColonna)} DROP NOT NULL;\n`
      : '';

  return `DO ${DELIMITATORE}
DECLARE
  vincolo record;
  esistente oid;
BEGIN
${nullabile}  SELECT c.oid INTO esistente
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
   WHERE c.conrelid = ${tabellaRegclass}
     AND c.contype = 'f'
     AND a.attname = ${letterale(primaColonna)}
   LIMIT 1;
  IF esistente IS NOT NULL
     AND obj_description(esistente, 'pg_constraint') IS NOT DISTINCT FROM ${firma} THEN
    RETURN;
  END IF;
  FOR vincolo IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = ${tabellaRegclass}
       AND c.contype = 'f'
       AND a.attname = ${letterale(primaColonna)}
  LOOP
    EXECUTE format('ALTER TABLE ${q} DROP CONSTRAINT %I', vincolo.conname);
  END LOOP;
  ALTER TABLE ${q} ADD CONSTRAINT ${vincolo}
    FOREIGN KEY (${colonneSql}) REFERENCES ${riferita} (${riferiteSql}) ON DELETE ${azione};
  COMMENT ON CONSTRAINT ${vincolo} ON ${q} IS ${firma};
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
${DELIMITATORE}`;
}
