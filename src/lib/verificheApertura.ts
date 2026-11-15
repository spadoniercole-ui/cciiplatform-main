// LA DATA DI APERTURA DI OGNI VERIFICA (0.236.0).
//
// Perché serve. Ogni verifica si apre in un giorno, e le assunzioni che si
// fanno dopo vanno confrontate con quel giorno: se la contabile è stata aperta
// nel 2026 e la proiezione arriva al 2026, una verifica riaperta nel 2027 deve
// poter dire che la serie è stata portata un anno più avanti con gli stessi
// criteri, o che i criteri sono cambiati. Senza la data d'apertura, «con gli
// stessi criteri» non è verificabile.
//
// La data si scrive UNA VOLTA: alla prima apertura. Non si aggiorna a ogni
// visita, altrimenti non sarebbe più un punto di riferimento — chi vuole
// riallinearla lo fa con un gesto esplicito che passa di qui.

import { pool } from '@/lib/db';

export type TipoVerifica = 'AMMINISTRATIVA' | 'CONTABILE' | 'AZIENDALE';

export const TIPI_VERIFICA: TipoVerifica[] = ['AMMINISTRATIVA', 'CONTABILE', 'AZIENDALE'];

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

/**
 * Crea la tabella, se non c'è. Idempotente: le verifiche già aperte non si
 * toccano, e uno spazio vecchio guadagna solo la tabella.
 */
export async function assicuraTabellaVerificheApertura(nomeSchema: string): Promise<void> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "${nomeSchema}".verifiche_apertura (
       azienda_id INTEGER NOT NULL REFERENCES "${nomeSchema}".aziende(id) ON DELETE CASCADE,
       tipo TEXT NOT NULL,
       aperta_il DATE NOT NULL DEFAULT CURRENT_DATE,
       PRIMARY KEY (azienda_id, tipo)
     )`
  );
}

/**
 * Apre la verifica e restituisce la data d'apertura (ISO, `AAAA-MM-GG`).
 *
 * Se era già aperta restituisce quella di allora: la data non si sposta.
 * `riaperti` dice se questa chiamata ha scritto la riga, così chi legge sa se
 * sta guardando un'apertura nuova.
 */
export async function apriVerifica(
  nomeSchema: string,
  aziendaId: number,
  tipo: TipoVerifica
): Promise<{ apertaIl: string | null; riaperta: boolean }> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');
  if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
    return { apertaIl: null, riaperta: false };
  }
  await assicuraTabellaVerificheApertura(nomeSchema);
  const inserita = await pool.query(
    `INSERT INTO "${nomeSchema}".verifiche_apertura (azienda_id, tipo)
     VALUES ($1, $2)
     ON CONFLICT (azienda_id, tipo) DO NOTHING
     RETURNING to_char(aperta_il, 'YYYY-MM-DD') AS aperta_il`,
    [aziendaId, tipo]
  );
  if (inserita.rows.length > 0) {
    return { apertaIl: String(inserita.rows[0].aperta_il), riaperta: true };
  }
  const letta = await pool.query(
    `SELECT to_char(aperta_il, 'YYYY-MM-DD') AS aperta_il
       FROM "${nomeSchema}".verifiche_apertura
      WHERE azienda_id = $1 AND tipo = $2`,
    [aziendaId, tipo]
  );
  return {
    apertaIl: letta.rows[0]?.aperta_il ? String(letta.rows[0].aperta_il) : null,
    riaperta: false,
  };
}

/** La data d'apertura, senza aprirla: null se la verifica non è mai stata aperta. */
export async function leggiAperturaVerifica(
  nomeSchema: string,
  aziendaId: number,
  tipo: TipoVerifica
): Promise<string | null> {
  if (!schemaOk(nomeSchema)) return null;
  try {
    const r = await pool.query(
      `SELECT to_char(aperta_il, 'YYYY-MM-DD') AS aperta_il
         FROM "${nomeSchema}".verifiche_apertura
        WHERE azienda_id = $1 AND tipo = $2`,
      [aziendaId, tipo]
    );
    return r.rows[0]?.aperta_il ? String(r.rows[0].aperta_il) : null;
  } catch {
    // Tabella assente (spazio mai aperto): non è un errore, è «non ancora».
    return null;
  }
}
