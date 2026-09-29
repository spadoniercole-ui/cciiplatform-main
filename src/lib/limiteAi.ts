// src/lib/limiteAi.ts
//
// Limite d'uso delle chiamate AI a consumo. Ogni chiamata ad Anthropic ha un
// costo; senza un tetto, una sessione valida (o uno script che ne riusa il
// cookie) può chiamare una funzione AI in ciclo e generare una spesa
// illimitata. Il primo caso protetto è l'estrazione dell'anagrafica dalle
// visure, che richiede la sola sessione.
//
// Due tetti, contati nel database (public.uso_ai) così valgono su tutte le
// istanze e dopo un riavvio:
//   - per utente, all'ora: frena l'abuso di un singolo account;
//   - per spazio, al giorno: tetto complessivo di spesa di un cliente.
// Valori predefiniti modificabili da variabili d'ambiente (vedi LIMITI).
//
// Se il database non risponde la chiamata è consentita: il limite protegge
// dai costi, non deve fermare il lavoro per un problema del contatore.

/** Esecutore SQL minimo (il Pool di `pg`, o PGlite nei test). */
export interface Esecutore {
  query(testo: string, parametri?: unknown[]): Promise<{ rows: any[] }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type FunzioneAi = 'VISURA';

interface Limiti {
  perUtenteOra: number;
  perSpazioGiorno: number;
}

function numeroDaEnv(v: string | undefined, predefinito: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : predefinito;
}

export function limitiAi(funzione: FunzioneAi, env: NodeJS.ProcessEnv = process.env): Limiti {
  switch (funzione) {
    case 'VISURA':
      return {
        perUtenteOra: numeroDaEnv(env.AI_VISURE_PER_UTENTE_ORA, 30),
        perSpazioGiorno: numeroDaEnv(env.AI_VISURE_PER_SPAZIO_GIORNO, 300),
      };
  }
}

let tabellaPronta = false;

/** Solo per i test. */
export function _azzeraStatoModulo(): void {
  tabellaPronta = false;
}

async function assicuraTabella(db: Esecutore): Promise<void> {
  if (tabellaPronta) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.uso_ai (
      funzione TEXT NOT NULL,
      soggetto TEXT NOT NULL,
      periodo TIMESTAMPTZ NOT NULL,
      chiamate INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (funzione, soggetto, periodo)
    )
  `);
  tabellaPronta = true;
}

async function incrementa(
  db: Esecutore,
  funzione: FunzioneAi,
  soggetto: string,
  unita: 'hour' | 'day'
): Promise<number> {
  const r = await db.query(
    `INSERT INTO public.uso_ai AS u (funzione, soggetto, periodo, chiamate)
     VALUES ($1, $2, date_trunc($3, now()), 1)
     ON CONFLICT (funzione, soggetto, periodo) DO UPDATE SET chiamate = u.chiamate + 1
     RETURNING chiamate`,
    [funzione, soggetto, unita]
  );
  return Number(r.rows[0]?.chiamate ?? 0);
}

export interface EsitoQuota {
  consentito: boolean;
  error?: string;
}

/**
 * Registra una chiamata e dice se è consentita. Da invocare subito prima
 * della chiamata ad Anthropic, dopo i controlli sull'input (un input non
 * valido non deve consumare quota).
 */
export async function consumaQuotaAi(
  db: Esecutore,
  funzione: FunzioneAi,
  chi: { utente: string; spazioId: number | null },
  env: NodeJS.ProcessEnv = process.env
): Promise<EsitoQuota> {
  const limiti = limitiAi(funzione, env);
  try {
    await assicuraTabella(db);
    const perUtente = await incrementa(db, funzione, `UTENTE:${chi.utente}`, 'hour');
    if (perUtente > limiti.perUtenteOra) {
      return {
        consentito: false,
        error: `Limite di ${limiti.perUtenteOra} estrazioni automatiche all'ora raggiunto. Riprova più tardi o compila i campi a mano.`,
      };
    }
    if (chi.spazioId !== null) {
      const perSpazio = await incrementa(db, funzione, `SPAZIO:${chi.spazioId}`, 'day');
      if (perSpazio > limiti.perSpazioGiorno) {
        return {
          consentito: false,
          error: `Limite giornaliero di ${limiti.perSpazioGiorno} estrazioni automatiche per questo spazio raggiunto. Riprova domani o compila i campi a mano.`,
        };
      }
    }
    // Pulizia dei contatori vecchi.
    if (Math.random() < 0.02) {
      await db.query(`DELETE FROM public.uso_ai WHERE periodo < now() - interval '7 days'`);
    }
    return { consentito: true };
  } catch (e) {
    console.error('[limiteAi] contatore non disponibile, chiamata consentita:', e);
    return { consentito: true };
  }
}
