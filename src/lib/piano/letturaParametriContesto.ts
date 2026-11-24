// Lettura e scrittura del contesto economico del piano (parametri_piano_contesto).
//
// Sta nella lib e non in un file 'use server': lo legge la simulazione a ogni
// elaborazione con l'AI, e lo scrive la pagina Parametri (solo Admin). Un
// elenco vuoto non è un errore: è uno spazio che non ha ancora dichiarato i
// propri fattori, e il prompt semplicemente non ne parla.

import { pool } from '@/lib/db';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import { parametriContestoValidi, type ParametroContesto } from '@/lib/piano/parametriContesto';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export async function leggiParametriContesto(nomeSchema: string): Promise<ParametroContesto[]> {
  if (!schemaOk(nomeSchema)) return [];
  // Nessun DDL sul percorso di lettura: la tabella la crea chi salva (o il
  // bootstrap dello spazio). Se non c'è, il contesto è semplicemente vuoto.
  const r = await pool
    .query(
      `SELECT descrizione, valore, tipo
         FROM "${nomeSchema}".parametri_piano_contesto
        ORDER BY ordinamento, id`
    )
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return parametriContestoValidi(
    r.rows.map((riga) => ({
      descrizione: riga.descrizione,
      valore: riga.valore,
      tipo: riga.tipo,
    }))
  );
}

/** Sostituisce l'intero elenco: è una lista breve, curata a mano. */
export async function scriviParametriContesto(
  nomeSchema: string,
  righe: ParametroContesto[]
): Promise<void> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');
  await assicuraTabelleParametriSpazio(nomeSchema);
  const valide = parametriContestoValidi(righe);
  await pool.query(`DELETE FROM "${nomeSchema}".parametri_piano_contesto`);
  for (const [i, p] of valide.entries()) {
    await pool.query(
      `INSERT INTO "${nomeSchema}".parametri_piano_contesto
         (descrizione, valore, tipo, ordinamento, aggiornato_il)
       VALUES ($1, $2, $3, $4, now())`,
      [p.descrizione, p.valore, p.tipo, i]
    );
  }
}
