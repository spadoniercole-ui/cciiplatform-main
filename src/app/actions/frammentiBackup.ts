'use server';

// Caricamento del file di backup A FRAMMENTI.
//
// PERCHÉ. Un backup reale supera il limite fisso di ~4,5 MB che la
// piattaforma di hosting impone al corpo delle richieste verso le funzioni.
// Il primo tentativo passava dallo storage esterno con caricamento diretto
// dal browser; ha introdotto però due dipendenze fuori dal nostro controllo:
// una variabile d'ambiente da configurare, e una chiamata di conferma che
// arriva dai server dello storage verso il deploy — bloccata dalla
// protezione degli accessi sulle anteprime, con il risultato di un
// caricamento che non si concludeva mai.
//
// Qui il file viene invece spezzato dal browser in frammenti sotto la soglia
// e inviato con più chiamate normali. Nessun servizio esterno, nessuna
// variabile d'ambiente, nessuna chiamata in entrata: funziona ovunque
// funzioni l'applicazione, edizione portable compresa.
//
// I frammenti stanno in una tabella di appoggio e vengono eliminati appena
// il file è stato ricomposto. Contengono le credenziali della piattaforma:
// non devono sopravvivere all'operazione. Per sicurezza, a ogni caricamento
// vengono eliminati anche i residui più vecchi di un'ora, così un'operazione
// interrotta non lascia nulla dietro di sé.

import { pool } from '@/lib/db';
import { assicuraTabella, eliminaScaduti } from '@/lib/backup/frammentiServer';

export interface RisultatoFrammento {
  success: boolean;
  ricevuti?: number;
  totale?: number;
  error?: string;
}

/** Riceve un frammento. Il browser li invia in sequenza. */
export async function inviaFrammentoBackupAction(
  id: string,
  indice: number,
  totale: number,
  contenuto: string
): Promise<RisultatoFrammento> {
  try {
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) {
      return { success: false, error: 'Identificativo del caricamento non valido.' };
    }
    await assicuraTabella();
    if (indice === 0) {
      // Un nuovo caricamento con lo stesso id sostituisce il precedente.
      await pool.query('DELETE FROM public.backup_frammenti WHERE id = $1', [id]);
      await eliminaScaduti();
    }
    await pool.query(
      `INSERT INTO public.backup_frammenti (id, indice, totale, contenuto)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id, indice) DO UPDATE SET contenuto = EXCLUDED.contenuto`,
      [id, indice, totale, contenuto]
    );
    const n = await pool.query(
      'SELECT count(*)::int AS n FROM public.backup_frammenti WHERE id = $1',
      [id]
    );
    return { success: true, ricevuti: Number(n.rows[0]?.n ?? 0), totale };
  } catch (error: unknown) {
    console.error('[inviaFrammentoBackupAction] Errore:', error);
    return {
      success: false,
      error: `Invio del frammento non riuscito: ${(error as Error).message}`,
    };
  }
}

/**
 * Ricompone il file dai frammenti. Verifica che ci siano TUTTI: un file
 * ricomposto da frammenti incompleti sarebbe indistinguibile da un backup
 * corrotto, e su un ripristino è esattamente ciò che non deve accadere.
 */
