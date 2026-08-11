// src/db/ensureTables.ts
//
// Auto-inizializzazione idempotente delle tabelle usate da Spazi e Licenze
// Commerciali. Ogni istruzione DDL viene eseguita come query SEPARATA, non
// come un unico blocco multi-istruzione: Postgres avvolge un blocco
// multi-istruzione in una transazione implicita, quindi se anche una sola
// istruzione nel mezzo fallisce, annulla anche quelle precedenti già
// riuscite nello stesso blocco. È successo esattamente questo: una
// CREATE INDEX su una colonna veniva eseguita prima dell'ALTER TABLE che
// la aggiungeva, su tabelle preesistenti senza quella colonna — l'indice
// falliva, e l'intero blocco (comprese le istruzioni già andate a buon
// fine) veniva annullato.
//
// Gli script in src/db/sql/*.sql restano la documentazione di riferimento
// della struttura delle tabelle.

import { pool } from '@/lib/db';
import { seedXbrlTagMappings } from '@/db/seedXbrlTagMappings';

let licenzeInizializzate = false;
let spaziInizializzati = false;
let indiceAdminInizializzato = false;

// Codici errore Postgres che indicano una corsa concorrente benigna: due
// richieste hanno provato a creare la stessa tabella/colonna/indice nello
// stesso istante. "IF NOT EXISTS" riduce ma non elimina del tutto questa
// possibilità in caso di corsa vera e propria tra connessioni diverse.
const CODICI_ERRORE_GIA_ESISTENTE = new Set([
  '42P07', // duplicate_table
  '42701', // duplicate_column
  '42710', // duplicate_object
  '23505', // unique_violation (cataloghi di sistema in corse concorrenti)
]);

/** Esegue una singola istruzione DDL. Se fallisce per "esiste già" (corsa
 * concorrente benigna) lo ignora; qualunque altro errore viene rilanciato,
 * ma SOLO per questa istruzione — non trascina con sé le precedenti. */
async function eseguiIstruzione(sql: string): Promise<void> {
  try {
    await pool.query(sql);
  } catch (error: any) {
    if (error?.code && CODICI_ERRORE_GIA_ESISTENTE.has(error.code)) {
      console.warn(
        "[ensureTables] Corsa concorrente rilevata durante l'auto-init (innocua, ignorata):",
        error.code,
        error.message
      );
      return;
    }
    throw error;
  }
}

async function eseguiInSequenza(istruzioni: string[]): Promise<void> {
  for (const istruzione of istruzioni) {
    await eseguiIstruzione(istruzione);
  }
}

export async function assicuraTabellaLicenze(): Promise<void> {
  if (licenzeInizializzate) return;

  await eseguiInSequenza([
    `CREATE TABLE IF NOT EXISTS public.licenze (
      id_licenza VARCHAR(50) PRIMARY KEY,
      ragione_sociale TEXT NOT NULL,
      codice_fiscale VARCHAR(32),
      partita_iva VARCHAR(32),
      indirizzo TEXT,
      cap VARCHAR(10),
      citta VARCHAR(100),
      pec VARCHAR(150),
      max_spazi INTEGER NOT NULL DEFAULT 5,
      max_aziende INTEGER NOT NULL DEFAULT 10,
      max_utenti INTEGER NOT NULL DEFAULT 15,
      data_attivazione TIMESTAMP NOT NULL DEFAULT now(),
      data_scadenza DATE,
      stato_disattiva BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    `ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS stato VARCHAR(20) NOT NULL DEFAULT 'ATTIVA'`,
    `ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS data_sospensione TIMESTAMP`,
    `ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS data_cessazione TIMESTAMP`,
    `ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS motivo_stato TEXT`,
    // Funzioni plus a livello di licenza COMMERCIALE, non più scelte ad
    // hoc alla creazione di ogni singolo spazio — uno spazio le eredita
    // dalla licenza commerciale che lo governa, nel momento in cui la si
    // sceglie. Restano comunque modificabili sul singolo spazio dopo
    // (Manutenzione Spazi), per i casi in cui uno spazio specifico deve
    // scostarsi da quanto la licenza prevede di norma.
    `ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS plus_dati_settore BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS plus_simulazione BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS plus_relazione_ai BOOLEAN NOT NULL DEFAULT FALSE`,
  ]);

  licenzeInizializzate = true;
}

export async function assicuraTabellaSessioni(): Promise<void> {
  await eseguiIstruzione(`
    CREATE TABLE IF NOT EXISTS public.sessioni (
      id SERIAL PRIMARY KEY,
      token VARCHAR(128) NOT NULL UNIQUE,
      ruolo VARCHAR(50) NOT NULL,
      workspace_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      expires_at TIMESTAMP NOT NULL
    )
  `);
  await eseguiIstruzione(`ALTER TABLE public.sessioni ADD COLUMN IF NOT EXISTS email TEXT`);
  await eseguiIstruzione(
    `CREATE INDEX IF NOT EXISTS idx_sessioni_token ON public.sessioni (token)`
  );
}

export async function assicuraTabelleSpazi(): Promise<void> {
  if (spaziInizializzati) return;

  // Le licenze commerciali devono esistere prima (FK da licenze_spazio).
  await assicuraTabellaLicenze();

  // Mappature dei tag XBRL — prima un passo manuale facile da
  // dimenticare (dopo un azzeramento, o su un ambiente mai avviato),
  // ora parte dello stesso provisioning automatico di tutto il resto.
  await seedXbrlTagMappings();

  await eseguiInSequenza([
    `CREATE TABLE IF NOT EXISTS public.spazi (
      id SERIAL PRIMARY KEY,
      codice VARCHAR(50) NOT NULL UNIQUE,
      descrizione TEXT NOT NULL,
      stato VARCHAR(20) NOT NULL DEFAULT 'ATTIVO',
      nome_schema VARCHAR(100),
      schema_provisionato BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`,
    // Colonne aggiunte dopo la prima versione della tabella: vanno PRIMA di
    // qualunque indice che le referenzi.
    `ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS nome_schema VARCHAR(100)`,
    `ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS schema_provisionato BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS tipo_spazio VARCHAR(20) NOT NULL DEFAULT 'NON_ENTE'`,
    `ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS giudicante BOOLEAN NOT NULL DEFAULT FALSE`,
    // Le direttrici lungo cui l'ente vuole che lo Screening generi le
    // domande della Check List (es. "vigilanza documentale, gestione
    // del credito, contenzioso amministrativo, contenzioso
    // giudiziario") — testo libero, non un enum: ogni ente ha le
    // proprie, cambiano da caso a caso.
    `ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS direttrici_ente TEXT`,
    // Sostituisce la colonna sopra: il testo libero produceva domande a
    // volte non pertinenti alla direttrice, senza un ancoraggio
    // verificabile. Ogni direttrice ora ha un elenco di "prodotti"
    // concreti (es. Cassa Integrazione, DURC, DICA) — l'AI genera 1-2
    // domande per prodotto elencato, non una direttrice in astratto.
    // Colonna nuova apposta, non un ALTER TYPE sulla vecchia: il testo
    // libero già inserito non è convertibile in modo affidabile in
    // questa struttura, meglio non perderlo silenziosamente.
    `ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS direttrici_ente_strutturate JSONB`,

    `CREATE TABLE IF NOT EXISTS public.licenze_spazio (
      id SERIAL PRIMARY KEY,
      spazio_id INTEGER NOT NULL REFERENCES public.spazi(id) ON DELETE CASCADE,
      licenza_commerciale_id VARCHAR(50) REFERENCES public.licenze(id_licenza),
      chiave_licenza VARCHAR(150) NOT NULL UNIQUE,
      tier VARCHAR(20) NOT NULL DEFAULT 'MICRO',
      stato VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      max_utenti INTEGER NOT NULL DEFAULT 5,
      max_aziende INTEGER NOT NULL DEFAULT 1,
      data_attivazione TIMESTAMP NOT NULL DEFAULT now(),
      data_scadenza TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`,
    // Anche qui: la colonna prima, l'indice che la usa dopo. Su una tabella
    // creata da una versione precedente di questo file, licenza_commerciale_id
    // e la lunghezza allargata di chiave_licenza potrebbero non esistere ancora.
    `ALTER TABLE public.licenze_spazio ADD COLUMN IF NOT EXISTS licenza_commerciale_id VARCHAR(50) REFERENCES public.licenze(id_licenza)`,
    `ALTER TABLE public.licenze_spazio ALTER COLUMN chiave_licenza TYPE VARCHAR(150)`,
    // Funzioni "plus": non incluse nella licenza base, si attivano una
    // per una — partono tutte disattivate finché il superadmin non le
    // abilita esplicitamente per quello spazio.
    `ALTER TABLE public.licenze_spazio ADD COLUMN IF NOT EXISTS plus_dati_settore BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE public.licenze_spazio ADD COLUMN IF NOT EXISTS plus_simulazione BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE public.licenze_spazio ADD COLUMN IF NOT EXISTS plus_relazione_ai BOOLEAN NOT NULL DEFAULT FALSE`,

    `CREATE INDEX IF NOT EXISTS idx_licenze_spazio_spazio_id ON public.licenze_spazio (spazio_id)`,
    `CREATE INDEX IF NOT EXISTS idx_licenze_spazio_licenza_commerciale ON public.licenze_spazio (licenza_commerciale_id)`,
  ]);

  spaziInizializzati = true;
}

/**
 * Indice globale email → schema dello spazio a cui appartiene l'Admin di
 * Spazio. Necessario perché ogni Admin di Spazio vive nello schema isolato
 * del proprio spazio (tenant_xxx), non nello schema public: senza questo
 * indice, il login non saprebbe in quale schema cercare le credenziali di
 * un'email data. Popolato da creaSpazioAction subito dopo aver creato
 * l'admin nel suo schema.
 */
export async function assicuraIndiceAdminSpazio(): Promise<void> {
  if (indiceAdminInizializzato) return;

  await eseguiInSequenza([
    `CREATE TABLE IF NOT EXISTS public.admin_spazio_index (
      email TEXT PRIMARY KEY,
      nome_schema VARCHAR(100) NOT NULL,
      spazio_id INTEGER NOT NULL REFERENCES public.spazi(id) ON DELETE CASCADE,
      codice_spazio VARCHAR(50) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`,
  ]);

  indiceAdminInizializzato = true;
}

/**
 * Indice globale email → schema per gli Utenti (Operativo/Consultatore),
 * stesso principio di admin_spazio_index ma per la tabella utenti_spazio
 * invece di admin_workspace. Popolato da creaUtenteSpazioAction alla
 * creazione dell'utente.
 */
export async function assicuraIndiceUtenteSpazio(): Promise<void> {
  await eseguiInSequenza([
    `CREATE TABLE IF NOT EXISTS public.utente_spazio_index (
      email TEXT PRIMARY KEY,
      nome_schema VARCHAR(100) NOT NULL,
      spazio_id INTEGER NOT NULL REFERENCES public.spazi(id) ON DELETE CASCADE,
      codice_spazio VARCHAR(50) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`,
  ]);
}
