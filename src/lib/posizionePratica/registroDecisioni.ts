// IL REGISTRO DELLE DECISIONI, LATO SERVER (0.242.0).
//
// Una tabella per spazio, una riga per decisione. Non sostituisce il ricalcolo:
// gli sta accanto e ne fissa il contesto (credito, copertura) al momento
// dell'atto. Nessuna guardia qui: le azioni chiamano questo modulo dopo aver
// verificato il chiamante.
//
// Il nome dello schema entra nell'SQL, quindi si valida prima di usarlo.

import { pool } from '@/lib/db';
import {
  validaDecisione,
  type BozzaDecisione,
  type Decisione,
  type EsitoDecisione,
  type ModalitaAutore,
} from './decisioni';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export async function assicuraTabellaDecisioni(nomeSchema: string): Promise<void> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');
  await pool.query(
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
       decisa_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  // La tabella della 0.242.0 non aveva l'id: si aggiunge senza toccare le
  // righe già scritte (che restano con autore_id null e il nome di allora).
  await pool.query(
    `ALTER TABLE "${nomeSchema}".pratica_decisioni
       ADD COLUMN IF NOT EXISTS autore_id INTEGER,
       ADD COLUMN IF NOT EXISTS autore_modalita TEXT`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS pratica_decisioni_azienda_idx
       ON "${nomeSchema}".pratica_decisioni (azienda_id, decisa_il DESC)`
  );
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
    decisaIl: new Date(r.decisa_il as string).toISOString(),
  };
}

export async function leggiDecisioniPratica(
  nomeSchema: string,
  aziendaId: number
): Promise<Decisione[]> {
  if (!schemaOk(nomeSchema)) return [];
  if (!Number.isInteger(aziendaId) || aziendaId <= 0) return [];
  try {
    await assicuraTabellaDecisioni(nomeSchema);
    const r = await pool.query(
      `SELECT id, esito, motivazione, autore, autore_id, autore_modalita,
              credito, copertura, decisa_il
         FROM "${nomeSchema}".pratica_decisioni
        WHERE azienda_id = $1
        ORDER BY decisa_il DESC, id DESC`,
      [aziendaId]
    );
    return r.rows.map(rigaDecisione);
  } catch {
    return [];
  }
}

export async function registraDecisionePratica(
  nomeSchema: string,
  aziendaId: number,
  bozza: Partial<BozzaDecisione>
): Promise<{ success: boolean; decisione?: Decisione; error?: string }> {
  if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
  if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
    return { success: false, error: 'Azienda non riconosciuta.' };
  }
  const validazione = validaDecisione(bozza);
  if (!validazione.valida)
    return { success: false, error: validazione.errore ?? 'Decisione non valida.' };

  try {
    await assicuraTabellaDecisioni(nomeSchema);
    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".pratica_decisioni
         (azienda_id, esito, motivazione, autore, autore_id, autore_modalita,
          credito, copertura)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, esito, motivazione, autore, autore_id, autore_modalita,
                 credito, copertura, decisa_il`,
      [
        aziendaId,
        bozza.esito,
        (bozza.motivazione ?? '').trim(),
        (bozza.autore ?? '').trim(),
        bozza.autoreId ?? null,
        bozza.autoreModalita ?? 'SALVAGENTE',
        bozza.credito ?? null,
        bozza.copertura ?? null,
      ]
    );
    return { success: true, decisione: rigaDecisione(r.rows[0]) };
  } catch (error: unknown) {
    return { success: false, error: `Decisione non registrata: ${(error as Error).message}` };
  }
}
