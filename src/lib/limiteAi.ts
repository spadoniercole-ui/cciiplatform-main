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

export type FunzioneAi = 'VISURA' | 'RISCONTRO' | 'PIANO';

/** Come si chiama, a schermo, ciò che si conta. */
const CONTEGGIO: Record<FunzioneAi, string> = {
  VISURA: 'estrazioni automatiche',
  RISCONTRO: 'verifiche sulle fonti',
  PIANO: 'elaborazioni del piano',
};

/** Cosa può fare chi ha esaurito il tetto. */
const CONSIGLIO: Record<FunzioneAi, string> = {
  VISURA: 'Riprova più tardi o compila i campi a mano.',
  RISCONTRO: 'Riprova più tardi: la riga resta «da riscontrare».',
  PIANO: 'Riprova più tardi: il piano in schermo resta quello salvato.',
};

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
    case 'RISCONTRO':
      // Un riscontro accompagna ogni salvataggio della parte giuridica: il
      // tetto serve a fermare un ciclo, non il lavoro ordinario di un Admin
      // che sistema l'anagrafica dei codici.
      return {
        perUtenteOra: numeroDaEnv(env.AI_RISCONTRI_PER_UTENTE_ORA, 60),
        perSpazioGiorno: numeroDaEnv(env.AI_RISCONTRI_PER_SPAZIO_GIORNO, 600),
      };
    case 'PIANO':
      // Un'elaborazione è la chiamata più cara della piattaforma: contesto
      // lungo, fino a sei ricerche web e seimila token di risposta, seguiti
      // dalla ricerca del motore. Il tetto è basso di proposito: un operatore
      // che rielabora il piano dieci volte in un'ora sta cercando il valore, non
      // lavorando, e dallo spazio non devono uscire sessanta al giorno.
      return {
        perUtenteOra: numeroDaEnv(env.AI_PIANI_PER_UTENTE_ORA, 10),
        perSpazioGiorno: numeroDaEnv(env.AI_PIANI_PER_SPAZIO_GIORNO, 60),
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

/**
 * Toglie una chiamata dal contatore: serve quando il conto va rifatto — un
 * tentativo rifiutato o un lavoro che non è arrivato al modello. Il GREATEST a
 * zero protegge dal rimborso doppio, che altrimenti porterebbe il contatore
 * sotto lo zero e regalerebbe quota.
 */
async function decrementa(
  db: Esecutore,
  funzione: FunzioneAi,
  soggetto: string,
  unita: 'hour' | 'day'
): Promise<void> {
  await db.query(
    `UPDATE public.uso_ai SET chiamate = GREATEST(chiamate - 1, 0)
      WHERE funzione = $1 AND soggetto = $2 AND periodo = date_trunc($3, now())`,
    [funzione, soggetto, unita]
  );
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
      // Il tentativo rifiutato non consuma: il contatore dice quante chiamate
      // sono partite, non quante sono state chieste. Chi è al tetto resta al
      // tetto, ma non perde la quota che gli resta.
      await decrementa(db, funzione, `UTENTE:${chi.utente}`, 'hour');
      return {
        consentito: false,
        error: `Limite di ${limiti.perUtenteOra} ${CONTEGGIO[funzione]} all'ora raggiunto. ${CONSIGLIO[funzione]}`,
      };
    }
    if (chi.spazioId !== null) {
      const perSpazio = await incrementa(db, funzione, `SPAZIO:${chi.spazioId}`, 'day');
      if (perSpazio > limiti.perSpazioGiorno) {
        // Si torna indietro su entrambi i contatori: la chiamata non parte, e
        // non deve pesare né sullo spazio né sull'utente che l'ha chiesta.
        await decrementa(db, funzione, `SPAZIO:${chi.spazioId}`, 'day');
        await decrementa(db, funzione, `UTENTE:${chi.utente}`, 'hour');
        return {
          consentito: false,
          error: `Limite giornaliero di ${limiti.perSpazioGiorno} ${CONTEGGIO[funzione]} per questo spazio raggiunto. ${CONSIGLIO[funzione]}`,
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

/**
 * Restituisce la chiamata registrata quando il lavoro non è stato fatto: la
 * quota si paga se il modello ha risposto, non se la richiesta è partita. Si
 * chiama dagli errori che avvengono dopo `consumaQuotaAi` — guasto di rete,
 * chiave revocata, credito esaurito — e non fa fallire il lavoro se il
 * contatore non risponde: il rimborso è una cortesia, l'errore vero è un altro.
 */
export async function rimborsaQuotaAi(
  db: Esecutore,
  funzione: FunzioneAi,
  chi: { utente: string; spazioId: number | null }
): Promise<void> {
  try {
    await decrementa(db, funzione, `UTENTE:${chi.utente}`, 'hour');
    if (chi.spazioId !== null) await decrementa(db, funzione, `SPAZIO:${chi.spazioId}`, 'day');
  } catch (e) {
    console.error('[limiteAi] rimborso non riuscito:', e);
  }
}
