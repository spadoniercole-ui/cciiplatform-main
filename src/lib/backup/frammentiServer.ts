// src/lib/backup/frammentiServer.ts
//
// Ricomposizione ed eliminazione dei frammenti. Funzioni di SERVIZIO, usate
// solo dal server.
//
// Stanno QUI e non in un file 'use server' per una ragione di sicurezza: in
// un file 'use server' ogni funzione esportata diventa un endpoint
// richiamabile dal browser. `assemblaFrammenti` restituisce il backup
// completo — cioè tutte le credenziali della piattaforma — e non deve essere
// invocabile da fuori in nessun caso, nemmeno indovinando un identificativo.

import { pool } from '@/lib/db';

const ORE_SCADENZA = 1;

export async function assicuraTabella(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.backup_frammenti (
      id TEXT NOT NULL,
      indice INTEGER NOT NULL,
      totale INTEGER NOT NULL,
      contenuto TEXT NOT NULL,
      creato_at TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (id, indice)
    )
  `);
}

/** Ripulisce i residui di caricamenti interrotti. */
export async function eliminaScaduti(): Promise<void> {
  await pool.query(
    `DELETE FROM public.backup_frammenti WHERE creato_at < now() - interval '${ORE_SCADENZA} hour'`
  );
}

export async function assemblaFrammenti(id: string): Promise<string> {
  await assicuraTabella();
  const r = await pool.query(
    'SELECT indice, totale, contenuto FROM public.backup_frammenti WHERE id = $1 ORDER BY indice',
    [id]
  );
  if (r.rows.length === 0) {
    throw new Error('Nessun frammento trovato: il caricamento non è stato completato.');
  }
  const totale = Number(r.rows[0].totale);
  if (r.rows.length !== totale) {
    throw new Error(
      `Caricamento incompleto: ricevuti ${r.rows.length} frammenti su ${totale}. Ricaricare il file.`
    );
  }
  for (let i = 0; i < totale; i++) {
    if (Number(r.rows[i].indice) !== i) {
      throw new Error(`Caricamento incoerente: manca il frammento ${i}. Ricaricare il file.`);
    }
  }
  return r.rows.map((x) => String(x.contenuto)).join('');
}

/** Elimina i frammenti di un caricamento. Non deve mai bloccare il flusso. */
export async function eliminaFrammenti(id: string): Promise<void> {
  try {
    await pool.query('DELETE FROM public.backup_frammenti WHERE id = $1', [id]);
  } catch (e) {
    console.error('[eliminaFrammenti] Errore:', e);
  }
}
