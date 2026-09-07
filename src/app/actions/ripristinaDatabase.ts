'use server';

// RIPRISTINO COMPLETO del database da un file di backup.
//
// È l'operazione più distruttiva della piattaforma: cancella tutto e
// riscrive. L'unica cosa che la rende accettabile è l'ORDINE dei passi.
//
//   1. si decifra e si valida il file, senza toccare niente;
//   2. lo si esegue in un database TEMPORANEO in memoria — se non gira lì,
//      non girerà nemmeno in produzione, e ci si ferma con il database
//      ancora intatto;
//   3. si genera un backup di sicurezza dello stato corrente;
//   4. SOLO ORA si azzera;
//   5. si esegue il ripristino;
//   6. si ricontano le righe, tabella per tabella.
//
// Validare prima e cancellare dopo è ciò che rende reversibile un errore. Il
// passo 2 in particolare è il motivo per cui questa funzione può essere
// offerta a un utente: la prova che il file funzioni avviene su una copia
// usa-e-getta, non sui dati veri.
//
// PGlite è Postgres compilato in WASM: eseguire lì lo script è una prova
// reale, non una simulazione.

import { pool } from '@/lib/db';
import { decifra } from '@/lib/portableCrypto';
import { leggiBackup, sembraCifrato, type IntestazioneBackup } from '@/lib/backup/leggi';
import { generaBackupCompletoAction } from '@/app/actions/backupDatabase';

export interface RisultatoRipristino {
  success: boolean;
  /** Fase raggiunta: dice all'utente FIN DOVE si è arrivati. */
  fase:
    | 'lettura'
    | 'validazione'
    | 'prova'
    | 'backup_sicurezza'
    | 'azzeramento'
    | 'esecuzione'
    | 'verifica'
    | 'completato';
  /** true se il database NON è stato toccato: l'errore è recuperabile. */
  databaseIntatto: boolean;
  intestazione?: IntestazioneBackup;
  problemi?: string[];
  tabelleRipristinate?: number;
  righeRipristinate?: number;
  /** Backup dello stato precedente, da conservare prima di procedere. */
  backupSicurezza?: { nomeFile: string; contenuto: string; byte: number };
  error?: string;
}

/** Decifra se serve e valida. Non tocca il database. */
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
      // qui, non produce testo plausibile. È una buona notizia.
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
  return { ok: true, sql: testo, intestazione: esito.intestazione };
}

/**
 * Prova il ripristino a vuoto: valida il file ed esegue lo script su un
 * database temporaneo. NON tocca il database di produzione.
 *
 * Va chiamata prima di `ripristinaDatabaseAction`, e l'interfaccia non
 * consente di procedere finché questa non è passata.
 */
export async function provaRipristinoAction(
  contenutoFile: string,
  passphrase?: string
): Promise<RisultatoRipristino> {
  const prep = await preparaScript(contenutoFile, passphrase);
  if (!prep.ok) {
    return { success: false, fase: 'validazione', databaseIntatto: true, problemi: prep.problemi };
  }

  try {
    const { PGlite } = await import('@electric-sql/pglite');
    const prova = await new PGlite();
    try {
      await prova.exec(prep.sql);
      const t = await prova.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_catalog.pg_tables
          WHERE schemaname = 'public' OR schemaname LIKE 'tenant\\_%'`
      );
      return {
        success: true,
        fase: 'prova',
        databaseIntatto: true,
        intestazione: prep.intestazione,
        tabelleRipristinate: t.rows[0]?.n ?? 0,
      };
    } finally {
      await prova.close();
    }
  } catch (error: unknown) {
    return {
      success: false,
      fase: 'prova',
      databaseIntatto: true,
      problemi: [
        `Lo script non è eseguibile: ${(error as Error).message}`,
        'Il database non è stato toccato.',
      ],
    };
  }
}

/**
 * Ripristino vero. Rifà da capo la validazione e la prova — non si fida di
 * una chiamata precedente, perché fra la prova e la conferma il file
 * caricato potrebbe essere cambiato.
 */
export async function ripristinaDatabaseAction(
  contenutoFile: string,
  passphrase?: string
): Promise<RisultatoRipristino> {
  // ---- 1-2. Validazione e prova, database ancora intatto -----------------
  const prova = await provaRipristinoAction(contenutoFile, passphrase);
  if (!prova.success) return prova;

  const prep = await preparaScript(contenutoFile, passphrase);
  if (!prep.ok) {
    return { success: false, fase: 'validazione', databaseIntatto: true, problemi: prep.problemi };
  }

  // ---- 3. Backup di sicurezza dello stato corrente -----------------------
  // Se il ripristino si interrompe a metà — un limite di durata sul cloud, un
  // vincolo inatteso — questo file è l'unica via di ritorno. Si genera IN
  // CHIARO di proposito: chiedere una seconda passphrase in un momento di
  // emergenza è un modo per perdere anche quella.
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

  // ---- 4. Azzeramento ----------------------------------------------------
  // Da qui in poi il database NON è più intatto.
  try {
    const schemi = await pool.query(
      `SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname LIKE 'tenant\\_%'`
    );
    for (const s of schemi.rows) {
      await pool.query(`DROP SCHEMA IF EXISTS "${String(s.nspname)}" CASCADE`);
    }
    const tab = await pool.query(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
    );
    for (const t of tab.rows) {
      await pool.query(`DROP TABLE IF EXISTS "public"."${String(t.tablename)}" CASCADE`);
    }
  } catch (error: unknown) {
    return {
      success: false,
      fase: 'azzeramento',
      databaseIntatto: false,
      backupSicurezza,
      problemi: [
        `Azzeramento non riuscito: ${(error as Error).message}`,
        'Conservare il backup di sicurezza qui accanto.',
      ],
    };
  }

  // ---- 5. Esecuzione -----------------------------------------------------
  try {
    await pool.query(prep.sql);
  } catch (error: unknown) {
    return {
      success: false,
      fase: 'esecuzione',
      databaseIntatto: false,
      backupSicurezza,
      problemi: [
        `Ripristino interrotto: ${(error as Error).message}`,
        'Il database è in uno stato incompleto. Ripetere l’operazione con il backup di sicurezza scaricato qui accanto.',
      ],
    };
  }

  // ---- 6. Riconteggio ----------------------------------------------------
  // Un ripristino che dice "fatto" senza aver ricontato è la stessa promessa
  // non verificata di un backup mai provato.
  try {
    const t = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' OR schemaname LIKE 'tenant\\_%'`
    );
    const tabelle = t.rows[0]?.n ?? 0;
    const attese = prova.intestazione?.tabelle ?? null;

    const problemi: string[] = [];
    if (attese !== null && tabelle !== attese) {
      problemi.push(
        `Il backup dichiarava ${attese} tabelle, nel database ripristinato ce ne sono ${tabelle}.`
      );
    }

    return {
      success: problemi.length === 0,
      fase: problemi.length === 0 ? 'completato' : 'verifica',
      databaseIntatto: false,
      intestazione: prova.intestazione,
      tabelleRipristinate: tabelle,
      righeRipristinate: prova.intestazione?.righe ?? undefined,
      backupSicurezza,
      problemi: problemi.length ? problemi : undefined,
    };
  } catch (error: unknown) {
    return {
      success: false,
      fase: 'verifica',
      databaseIntatto: false,
      backupSicurezza,
      problemi: [`Verifica finale non riuscita: ${(error as Error).message}`],
    };
  }
}
