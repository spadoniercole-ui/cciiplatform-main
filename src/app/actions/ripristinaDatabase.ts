'use server';

// RIPRISTINO COMPLETO del database da un file di backup.
//
// È l'operazione più distruttiva della piattaforma: cancella tutto e
// riscrive. Ciò che la rende accettabile è l'ORDINE dei passi — si valida
// prima e si cancella dopo — e il fatto che si possa provare senza rischiare.
//
// ---------------------------------------------------------------------------
// COME SI PROVA UN RIPRISTINO SENZA FARLO
//
// La prima versione avviava un PGlite temporaneo (Postgres compilato in WASM)
// e ci eseguiva lo script. Funzionava nell'edizione portable e NON sul cloud:
// in una funzione serverless gli asset WASM vanno tracciati a parte e
// l'inizializzazione costa secondi e memoria, contro un tetto di durata. Il
// risultato era una Server Action che moriva senza risposta, con il browser a
// mostrare "An unexpected response was received from the server" proprio sul
// pulsante che precede la cancellazione del database.
//
// Non serviva un secondo motore: PostgreSQL sa gia' fare le prove a vuoto,
// perche' anche le istruzioni di struttura (CREATE, DROP, ALTER) sono
// transazionali. Si apre una transazione, si esegue tutto — cancellazione
// compresa — si guarda com'e' andata, e si annulla con ROLLBACK. Il database
// torna esattamente com'era.
//
// E' migliore su ogni fronte: nessun WASM da tracciare, nessuna
// inizializzazione da secondi, stesso codice nelle due edizioni, e una prova
// PIU' FEDELE — gira sullo stesso motore e sulla stessa versione di Postgres
// che ospita i dati, e verifica anche la cancellazione dello schema
// esistente, che su un database vuoto non poteva emergere.
//
// Il costo e' un blocco temporaneo sulle tabelle durante la prova,
// accettabile per un'operazione da Superadmin. Se la connessione cade a
// meta', Postgres annulla tutto da se': e' il comportamento predefinito.
//
// NOTA CRITICA: lo script del backup contiene un proprio BEGIN/COMMIT. Va
// rimosso (`rimuoviTransazione`), altrimenti quel COMMIT chiuderebbe la
// NOSTRA transazione e la prova a vuoto diventerebbe una cancellazione vera.
// ---------------------------------------------------------------------------

import { pool } from '@/lib/db';
import { decifra } from '@/lib/portableCrypto';
import {
  leggiBackup,
  sembraCifrato,
  rimuoviTransazione,
  type IntestazioneBackup,
} from '@/lib/backup/leggi';
import { generaBackupCompletoAction } from '@/app/actions/backupDatabase';

export interface RisultatoRipristino {
  success: boolean;
  fase:
    | 'lettura'
    | 'validazione'
    | 'prova'
    | 'backup_sicurezza'
    | 'esecuzione'
    | 'verifica'
    | 'completato';
  /** true se il database NON e' stato toccato: l'errore e' recuperabile. */
  databaseIntatto: boolean;
  intestazione?: IntestazioneBackup;
  problemi?: string[];
  tabelleRipristinate?: number;
  righeRipristinate?: number;
  backupSicurezza?: { nomeFile: string; contenuto: string; byte: number };
  error?: string;
}

type Client = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  release: () => void;
};

/**
 * Recupera il contenuto del backup.
 *
 * Due strade, perché i file grandi non possono attraversare una Server
 * Action: sopra i ~4,5 MB la piattaforma di hosting respinge la richiesta
 * prima ancora di invocare la funzione. In quel caso il browser carica il
 * file direttamente sullo storage e ci passa solo l'INDIRIZZO; qui lo si va a
 * leggere, e la lettura da parte del server non ha quel limite.
 *
 * Il file viene sempre eliminato dallo storage dopo l'uso: contiene tutte le
 * credenziali della piattaforma, e la regola qui è che i file caricati non si
 * conservano mai.
 */
async function recuperaContenuto(riferimento: string): Promise<string> {
  if (!/^https?:\/\//.test(riferimento)) return riferimento;
  const r = await fetch(riferimento);
  if (!r.ok) {
    throw new Error(`Lettura del file caricato non riuscita (HTTP ${r.status}).`);
  }
  return r.text();
}

/** Elimina il file temporaneo dallo storage. Non deve mai bloccare il flusso. */
async function eliminaTemporaneo(riferimento: string): Promise<void> {
  if (!/^https?:\/\//.test(riferimento)) return;
  try {
    const { del } = await import('@vercel/blob');
    await del(riferimento);
  } catch (e) {
    console.error('[ripristino] eliminazione del file temporaneo non riuscita:', e);
  }
}

async function preparaScript(
  contenutoFile: string,
  passphrase?: string
): Promise<
  { ok: true; sql: string; intestazione?: IntestazioneBackup } | { ok: false; problemi: string[] }
> {
  let testo = contenutoFile;

  if (sembraCifrato(contenutoFile)) {
    if (!passphrase) {
      return {
        ok: false,
        problemi: ['Il file risulta cifrato: serve la passphrase con cui è stato generato.'],
      };
    }
    try {
      testo = decifra(Buffer.from(contenutoFile, 'base64'), passphrase).toString('utf8');
    } catch {
      // AES-GCM ha un tag di autenticazione: una passphrase errata fallisce
      // qui, non produce testo plausibile.
      return {
        ok: false,
        problemi: [
          'Decifratura non riuscita: la passphrase è errata, oppure il file è danneggiato.',
        ],
      };
    }
  }

  const esito = leggiBackup(testo);
  if (!esito.valido) return { ok: false, problemi: esito.problemi };
  return { ok: true, sql: rimuoviTransazione(testo), intestazione: esito.intestazione };
}

/** Istruzioni di cancellazione dello schema esistente. */
async function istruzioniAzzeramento(client: Client): Promise<string[]> {
  const schemi = await client.query(
    `SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname LIKE 'tenant\\_%'`
  );
  const tabelle = await client.query(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
  );
  return [
    ...schemi.rows.map((s) => `DROP SCHEMA IF EXISTS "${String(s.nspname)}" CASCADE`),
    ...tabelle.rows.map((t) => `DROP TABLE IF EXISTS "public"."${String(t.tablename)}" CASCADE`),
  ];
}

async function contaTabelle(client: Client): Promise<number> {
  const t = await client.query(
    `SELECT count(*)::int AS n FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' OR schemaname LIKE 'tenant\\_%'`
  );
  return Number((t.rows[0] as { n: number })?.n ?? 0);
}

/**
 * Prova il ripristino a vuoto: esegue TUTTA l'operazione — cancellazione
 * compresa — dentro una transazione che viene poi annullata. Il database
 * resta esattamente com'era.
 */
export async function provaRipristinoAction(
  contenutoFile: string,
  passphrase?: string
): Promise<RisultatoRipristino> {
  let contenuto: string;
  try {
    contenuto = await recuperaContenuto(contenutoFile);
  } catch (error: unknown) {
    return {
      success: false,
      fase: 'lettura',
      databaseIntatto: true,
      problemi: [(error as Error).message],
    };
  }

  const prep = await preparaScript(contenuto, passphrase);
  if (!prep.ok) {
    return { success: false, fase: 'validazione', databaseIntatto: true, problemi: prep.problemi };
  }

  let client: Client;
  try {
    client = (await pool.connect()) as Client;
  } catch (error: unknown) {
    return {
      success: false,
      fase: 'prova',
      databaseIntatto: true,
      problemi: [`Connessione al database non riuscita: ${(error as Error).message}`],
    };
  }

  try {
    await client.query('BEGIN');
    try {
      for (const istruzione of await istruzioniAzzeramento(client)) {
        await client.query(istruzione);
      }
      await client.query(prep.sql);
      const tabelle = await contaTabelle(client);

      return {
        success: true,
        fase: 'prova',
        databaseIntatto: true,
        intestazione: prep.intestazione,
        tabelleRipristinate: tabelle,
      };
    } finally {
      // SEMPRE, anche in caso di successo: questa è una prova, non il
      // ripristino. Il `finally` garantisce l'annullamento anche quando si
      // esce dal blocco `try` con un return.
      await client.query('ROLLBACK');
    }
  } catch (error: unknown) {
    return {
      success: false,
      fase: 'prova',
      databaseIntatto: true,
      intestazione: prep.intestazione,
      problemi: [
        `Lo script non è eseguibile: ${(error as Error).message}`,
        'La prova è stata annullata: il database non è stato toccato.',
      ],
    };
  } finally {
    client.release();
  }
}

/**
 * Ripristino vero. Rifà da capo validazione e prova — non si fida di una
 * chiamata precedente, perché fra la prova e la conferma il file caricato
 * potrebbe essere cambiato.
 *
 * Cancellazione ed esecuzione avvengono in UN'UNICA transazione: o riesce
 * tutto, o il database resta com'era. Non esiste più lo stato intermedio
 * "azzerato ma non ripristinato" della versione precedente.
 */
export async function ripristinaDatabaseAction(
  contenutoFile: string,
  passphrase?: string
): Promise<RisultatoRipristino> {
  const prova = await provaRipristinoAction(contenutoFile, passphrase);
  if (!prova.success) return prova;

  let contenuto: string;
  try {
    contenuto = await recuperaContenuto(contenutoFile);
  } catch (error: unknown) {
    return {
      success: false,
      fase: 'lettura',
      databaseIntatto: true,
      problemi: [(error as Error).message],
    };
  }

  const prep = await preparaScript(contenuto, passphrase);
  if (!prep.ok) {
    return { success: false, fase: 'validazione', databaseIntatto: true, problemi: prep.problemi };
  }

  // Backup di sicurezza dello stato corrente. In chiaro di proposito:
  // chiedere una seconda passphrase in un momento di emergenza è un modo per
  // perdere anche quella.
  let backupSicurezza: RisultatoRipristino['backupSicurezza'];
  try {
    const b = await generaBackupCompletoAction();
    if (b.success && b.contenuto && b.nomeFile) {
      backupSicurezza = {
        nomeFile: b.nomeFile.replace('.sql', '-PRIMA-DEL-RIPRISTINO.sql'),
        contenuto: b.contenuto,
        byte: b.byte ?? 0,
      };
    }
  } catch (e) {
    console.error('[ripristino] backup di sicurezza non riuscito:', e);
  }

  if (!backupSicurezza) {
    return {
      success: false,
      fase: 'backup_sicurezza',
      databaseIntatto: true,
      problemi: [
        'Non è stato possibile salvare lo stato corrente prima di procedere.',
        'Il ripristino è stato interrotto: senza una via di ritorno non si cancella nulla.',
      ],
    };
  }

  let client: Client;
  try {
    client = (await pool.connect()) as Client;
  } catch (error: unknown) {
    return {
      success: false,
      fase: 'esecuzione',
      databaseIntatto: true,
      backupSicurezza,
      problemi: [`Connessione al database non riuscita: ${(error as Error).message}`],
    };
  }

  try {
    await client.query('BEGIN');
    try {
      for (const istruzione of await istruzioniAzzeramento(client)) {
        await client.query(istruzione);
      }
      await client.query(prep.sql);

      const tabelle = await contaTabelle(client);
      const attese = prova.intestazione?.tabelle ?? null;

      if (attese !== null && tabelle !== attese) {
        // Discrepanza: si annulla, invece di lasciare un database dubbio.
        await client.query('ROLLBACK');
        return {
          success: false,
          fase: 'verifica',
          databaseIntatto: true,
          backupSicurezza,
          problemi: [
            `Il backup dichiarava ${attese} tabelle, dopo il ripristino ne risultano ${tabelle}.`,
            'L’operazione è stata annullata: il database è rimasto quello di prima.',
          ],
        };
      }

      await client.query('COMMIT');
      await eliminaTemporaneo(contenutoFile);
      return {
        success: true,
        fase: 'completato',
        databaseIntatto: false,
        intestazione: prova.intestazione,
        tabelleRipristinate: tabelle,
        righeRipristinate: prova.intestazione?.righe ?? undefined,
        backupSicurezza,
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      return {
        success: false,
        fase: 'esecuzione',
        // Annullata per intero: il database è quello di prima.
        databaseIntatto: true,
        backupSicurezza,
        problemi: [
          `Ripristino non riuscito: ${(error as Error).message}`,
          'L’operazione è stata annullata per intero: il database è rimasto quello di prima.',
        ],
      };
    }
  } finally {
    client.release();
  }
}
