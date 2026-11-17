// IL REGISTRO DELLE DECISIONI, LATO SERVER (0.242.0).
//
// Una tabella per spazio, una riga per decisione. Non sostituisce il ricalcolo:
// gli sta accanto e ne fissa il contesto (credito, copertura) al momento
// dell'atto. Nessuna guardia qui: le azioni chiamano questo modulo dopo aver
// verificato il chiamante.
//
// LA TRACCIA NON SI MODIFICA (0.243.0). La tabella non aveva difese: una riga
// poteva essere corretta o cancellata a mano, e una traccia modificabile non è
// una prova. Un trigger BEFORE UPDATE OR DELETE rifiuta l'operazione, così il
// registro resta quello che era nel momento in cui è stato scritto. Il trigger
// non tocca l'archivio (backup/ripristino) né le DDL: protegge le righe.
//
// L'AUTORE RESTA LEGGIBILE NEL TEMPO: `autoreAttivo` dice se la riga utente che
// ha firmato esiste ancora ed è attiva — un firmatario disattivato non sparisce
// e non viene scambiato per un utente corrente.
//
// Il nome dello schema entra nell'SQL, quindi si valida prima di usarlo.

import { pool } from '@/lib/db';
import {
  validaDecisione,
  type BozzaDecisione,
  type Decisione,
  type EsitoDecisione,
  type GradoPosizione,
  type ModalitaAutore,
} from './decisioni';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

/** Quello che serve a questo modulo: basta il Pool di `pg` o un PGlite nei test. */
export type EsecutoreDecisioni = {
  query: (sql: string, valori?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export async function assicuraTabellaDecisioni(
  nomeSchema: string,
  db: EsecutoreDecisioni = pool
): Promise<void> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');
  await db.query(
    `CREATE TABLE IF NOT EXISTS "${nomeSchema}".pratica_decisioni (
       id SERIAL PRIMARY KEY,
       azienda_id INTEGER NOT NULL,
       esito TEXT NOT NULL,
       motivazione TEXT NOT NULL,
       autore TEXT NOT NULL,
       autore_id INTEGER,
       autore_modalita TEXT,
       credito NUMERIC,
       copertura TEXT,
       stato_grado TEXT,
       stato_blocchi INTEGER,
       decisa_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  // La tabella della 0.242.0 non aveva l'id: si aggiunge senza toccare le
  // righe già scritte (che restano con autore_id null e il nome di allora).
  await db.query(
    `ALTER TABLE "${nomeSchema}".pratica_decisioni
       ADD COLUMN IF NOT EXISTS autore_id INTEGER,
       ADD COLUMN IF NOT EXISTS autore_modalita TEXT,
       ADD COLUMN IF NOT EXISTS stato_grado TEXT,
       ADD COLUMN IF NOT EXISTS stato_blocchi INTEGER`
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS pratica_decisioni_azienda_idx
       ON "${nomeSchema}".pratica_decisioni (azienda_id, decisa_il DESC)`
  );
  await assicuraTriggerImmutabile(nomeSchema, db);
}

/**
 * Il trigger che rende la traccia immutabile. È idempotente: la funzione si
 * sostituisce, il trigger si crea solo se non c'è. Se il database non
 * supportasse PL/pgSQL (edizione molto vecchia) la tabella resta usabile e
 * l'errore si dichiara nel log invece di impedire la lettura delle decisioni.
 */
async function assicuraTriggerImmutabile(
  nomeSchema: string,
  db: EsecutoreDecisioni
): Promise<void> {
  try {
    await db.query(
      `CREATE OR REPLACE FUNCTION "${nomeSchema}".pratica_decisioni_immutabile()
         RETURNS trigger LANGUAGE plpgsql AS $fn$
       BEGIN
         RAISE EXCEPTION 'La traccia delle decisioni non si modifica né si cancella (operazione % su pratica_decisioni).', TG_OP;
       END
       $fn$`
    );
    await db.query(
      `DO $do$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_trigger
            WHERE tgname = 'pratica_decisioni_immutabile'
              AND tgrelid = '"${nomeSchema}".pratica_decisioni'::regclass
         ) THEN
           CREATE TRIGGER pratica_decisioni_immutabile
             BEFORE UPDATE OR DELETE ON "${nomeSchema}".pratica_decisioni
             FOR EACH ROW EXECUTE FUNCTION "${nomeSchema}".pratica_decisioni_immutabile();
         END IF;
       END
       $do$`
    );
  } catch (error) {
    console.error('[registroDecisioni] Trigger di immutabilità non creato:', error);
  }
}

const numeroONull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function rigaDecisione(r: Record<string, unknown>): Decisione {
  return {
    id: Number(r.id),
    esito: String(r.esito) as EsitoDecisione,
    motivazione: String(r.motivazione),
    autore: String(r.autore),
    autoreId: numeroONull(r.autore_id),
    autoreModalita: (r.autore_modalita ?? null) as ModalitaAutore | null,
    credito: numeroONull(r.credito),
    copertura: r.copertura === null || r.copertura === undefined ? null : String(r.copertura),
    statoGrado: (r.stato_grado ?? null) as GradoPosizione | null,
    statoBlocchi: numeroONull(r.stato_blocchi),
    decisaIl: new Date(r.decisa_il as string).toISOString(),
    autoreAttivo: null,
  };
}

/**
 * Quali utenti che hanno firmato esistono ancora. L'id da solo è ambiguo fra
 * `admin_workspace` e `utenti_spazio`: la modalità dice in quale tabella
 * cercare. Un errore di lettura non nasconde la decisione: `autoreAttivo`
 * resta null, cioè «non si è potuto dire».
 */
async function autoriAttivi(
  nomeSchema: string,
  decisioni: Decisione[],
  db: EsecutoreDecisioni
): Promise<Map<string, boolean>> {
  const risultato = new Map<string, boolean>();
  const adminIds = decisioni
    .filter((d) => d.autoreModalita === 'ADMIN_SPAZIO' && d.autoreId !== null)
    .map((d) => d.autoreId as number);
  const utenteIds = decisioni
    .filter((d) => d.autoreModalita === 'OPERATORE' && d.autoreId !== null)
    .map((d) => d.autoreId as number);

  try {
    if (adminIds.length > 0) {
      const r = await db.query(
        `SELECT id FROM "${nomeSchema}".admin_workspace WHERE id = ANY($1::int[])`,
        [adminIds]
      );
      const presenti = new Set(r.rows.map((x) => Number(x.id)));
      for (const id of adminIds) risultato.set(`ADMIN_SPAZIO:${id}`, presenti.has(id));
    }
  } catch {
    // Tabella assente: non si può dire, non si inventa.
  }

  try {
    if (utenteIds.length > 0) {
      const r = await db.query(
        `SELECT id, COALESCE(attivo, TRUE) AS attivo
           FROM "${nomeSchema}".utenti_spazio WHERE id = ANY($1::int[])`,
        [utenteIds]
      );
      const attive = new Map(r.rows.map((x) => [Number(x.id), x.attivo !== false]));
      for (const id of utenteIds) risultato.set(`OPERATORE:${id}`, attive.get(id) === true);
    }
  } catch {
    // Tabella assente: come sopra.
  }

  return risultato;
}

export async function leggiDecisioniPratica(
  nomeSchema: string,
  aziendaId: number,
  db: EsecutoreDecisioni = pool
): Promise<Decisione[]> {
  if (!schemaOk(nomeSchema)) return [];
  if (!Number.isInteger(aziendaId) || aziendaId <= 0) return [];
  try {
    await assicuraTabellaDecisioni(nomeSchema, db);
    const r = await db.query(
      `SELECT id, esito, motivazione, autore, autore_id, autore_modalita,
              credito, copertura, stato_grado, stato_blocchi, decisa_il
         FROM "${nomeSchema}".pratica_decisioni
        WHERE azienda_id = $1
        ORDER BY decisa_il DESC, id DESC`,
      [aziendaId]
    );
    const decisioni = r.rows.map(rigaDecisione);
    const attivi = await autoriAttivi(nomeSchema, decisioni, db);
    return decisioni.map((d) => ({
      ...d,
      autoreAttivo:
        d.autoreId === null || d.autoreModalita === null
          ? null
          : (attivi.get(`${d.autoreModalita}:${d.autoreId}`) ?? null),
    }));
  } catch {
    return [];
  }
}

export async function registraDecisionePratica(
  nomeSchema: string,
  aziendaId: number,
  bozza: Partial<BozzaDecisione>,
  db: EsecutoreDecisioni = pool
): Promise<{ success: boolean; decisione?: Decisione; error?: string }> {
  if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
  if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
    return { success: false, error: 'Azienda non riconosciuta.' };
  }
  const validazione = validaDecisione(bozza);
  if (!validazione.valida)
    return { success: false, error: validazione.errore ?? 'Decisione non valida.' };

  try {
    await assicuraTabellaDecisioni(nomeSchema, db);
    const r = await db.query(
      `INSERT INTO "${nomeSchema}".pratica_decisioni
         (azienda_id, esito, motivazione, autore, autore_id, autore_modalita,
          credito, copertura, stato_grado, stato_blocchi)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, esito, motivazione, autore, autore_id, autore_modalita,
                 credito, copertura, stato_grado, stato_blocchi, decisa_il`,
      [
        aziendaId,
        bozza.esito,
        (bozza.motivazione ?? '').trim(),
        (bozza.autore ?? '').trim(),
        bozza.autoreId ?? null,
        bozza.autoreModalita ?? 'SALVAGENTE',
        bozza.credito ?? null,
        bozza.copertura ?? null,
        bozza.statoGrado ?? null,
        bozza.statoBlocchi ?? null,
      ]
    );
    // Chi ha appena firmato esiste per definizione: la riga è stata autorizzata
    // da quella sessione.
    return { success: true, decisione: { ...rigaDecisione(r.rows[0]), autoreAttivo: true } };
  } catch (error: unknown) {
    return { success: false, error: `Decisione non registrata: ${(error as Error).message}` };
  }
}
