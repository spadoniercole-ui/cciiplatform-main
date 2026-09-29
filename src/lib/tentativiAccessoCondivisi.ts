// src/lib/tentativiAccessoCondivisi.ts
//
// Limitazione dei tentativi di accesso CONDIVISA tra processi: il conteggio
// sta anche nel database (public.tentativi_accesso), così vale su più
// istanze serverless e sopravvive ai riavvii — il limite dichiarato di
// src/lib/tentativiAccesso.ts, che resta il primo filtro.
//
// Perché entrambi. Il contatore in memoria scatta per primo e, una volta
// bloccata la chiave, risponde senza toccare il database: chi insiste non può
// usare i tentativi per far lavorare il database (l'obiezione originale al
// conteggio su DB). Il database vede quindi al massimo MAX_TENTATIVI scritture
// per chiave e per istanza a ogni finestra di blocco.
//
// Se il database non risponde si ricade sul solo contatore in memoria: un
// problema del limitatore non deve impedire gli accessi.
//
// Il tempo è quello del database (now()), uguale per tutte le istanze.
import {
  azzeraTentativi,
  controllaTentativi,
  MAX_TENTATIVI,
  MINUTI_BLOCCO,
  registraFallimento,
  type EsitoControllo,
} from './tentativiAccesso';

/** Esecutore SQL minimo (il Pool di `pg`, o PGlite nei test). */
export interface Esecutore {
  query(testo: string, parametri?: unknown[]): Promise<{ rows: any[] }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let tabellaPronta = false;

async function assicuraTabella(db: Esecutore): Promise<void> {
  if (tabellaPronta) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.tentativi_accesso (
      chiave TEXT PRIMARY KEY,
      fallimenti INTEGER NOT NULL DEFAULT 0,
      bloccato_fino TIMESTAMPTZ,
      aggiornato TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  tabellaPronta = true;
}

/** Solo per i test: dimentica che la tabella esiste già. */
export function _azzeraStatoModulo(): void {
  tabellaPronta = false;
}

function avvisa(operazione: string, e: unknown) {
  console.error(
    `[tentativiAccesso] ${operazione} sul database non riuscito (vale il solo limite in memoria):`,
    e
  );
}

/** Da chiamare PRIMA di verificare la password. */
export async function controllaTentativiCondivisi(
  db: Esecutore,
  chiave: string
): Promise<EsitoControllo> {
  const locale = controllaTentativi(chiave);
  if (locale.bloccato) return locale;
  try {
    await assicuraTabella(db);
    const r = await db.query(
      `SELECT CEIL(EXTRACT(EPOCH FROM (bloccato_fino - now())))::int AS secondi
         FROM public.tentativi_accesso
        WHERE chiave = $1 AND bloccato_fino > now()`,
      [chiave]
    );
    const secondi = Number(r.rows[0]?.secondi ?? 0);
    if (secondi > 0) return { bloccato: true, secondiRimanenti: secondi, rimanenti: 0 };
  } catch (e) {
    avvisa('controllo', e);
  }
  return locale;
}

/** Da chiamare dopo un tentativo FALLITO. */
export async function registraFallimentoCondiviso(
  db: Esecutore,
  chiave: string
): Promise<EsitoControllo> {
  const locale = registraFallimento(chiave);
  try {
    await assicuraTabella(db);
    // Il conteggio riparte da 1 se il blocco precedente è scaduto o se
    // l'ultimo errore è più vecchio della finestra di blocco.
    const r = await db.query(
      `INSERT INTO public.tentativi_accesso AS t (chiave, fallimenti, aggiornato)
       VALUES ($1, 1, now())
       ON CONFLICT (chiave) DO UPDATE SET
         fallimenti = CASE
           WHEN t.bloccato_fino > now() THEN t.fallimenti
           WHEN t.bloccato_fino IS NOT NULL OR t.aggiornato < now() - make_interval(mins => $2)
             THEN 1
           ELSE t.fallimenti + 1
         END,
         bloccato_fino = CASE WHEN t.bloccato_fino > now() THEN t.bloccato_fino END,
         aggiornato = now()
       RETURNING fallimenti,
         CEIL(EXTRACT(EPOCH FROM (COALESCE(bloccato_fino, now()) - now())))::int AS secondi`,
      [chiave, MINUTI_BLOCCO]
    );
    let secondi = Number(r.rows[0]?.secondi ?? 0);
    if (secondi <= 0 && Number(r.rows[0]?.fallimenti ?? 0) >= MAX_TENTATIVI) {
      await db.query(
        `UPDATE public.tentativi_accesso
            SET bloccato_fino = now() + make_interval(mins => $2), fallimenti = 0
          WHERE chiave = $1`,
        [chiave, MINUTI_BLOCCO]
      );
      secondi = MINUTI_BLOCCO * 60;
    }
    // Pulizia delle chiavi inattive (es. nomi utente inventati): la tabella
    // non cresce senza limite.
    if (Math.random() < 0.05) {
      await db.query(
        `DELETE FROM public.tentativi_accesso
          WHERE aggiornato < now() - interval '1 day'
            AND (bloccato_fino IS NULL OR bloccato_fino < now())`
      );
    }
    if (secondi > 0) return { bloccato: true, secondiRimanenti: secondi, rimanenti: 0 };
  } catch (e) {
    avvisa('registrazione', e);
  }
  return locale;
}

/** Da chiamare dopo un accesso RIUSCITO: il contatore si azzera ovunque. */
export async function azzeraTentativiCondivisi(db: Esecutore, chiave: string): Promise<void> {
  azzeraTentativi(chiave);
  try {
    await assicuraTabella(db);
    await db.query('DELETE FROM public.tentativi_accesso WHERE chiave = $1', [chiave]);
  } catch (e) {
    avvisa('azzeramento', e);
  }
}

/** Messaggio per chi è bloccato, uguale per utenti esistenti e non. */
export function messaggioBlocco(secondiRimanenti: number): string {
  const minuti = Math.max(1, Math.ceil(secondiRimanenti / 60));
  return `Troppi tentativi falliti. Riprovare fra ${minuti} ${minuti === 1 ? 'minuto' : 'minuti'}.`;
}
