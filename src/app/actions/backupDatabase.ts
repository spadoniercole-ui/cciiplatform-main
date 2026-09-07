'use server';

// BACKUP COMPLETO del database — schema, dati e sequenze.
//
// Diverso da `dumpDati.ts`, che genera SOLI INSERT ed è pensato per migrare
// verso un altro database già inizializzato dal codice applicativo. Quello è
// un export; questo è un backup: deve poter ricostruire il database da zero
// SENZA il codice, perché il giorno in cui serve un backup è il giorno in cui
// non si può dare per scontato di avere il resto.
//
// PERCHÉ NON pg_dump — su Vercel non è installabile alcun binario a runtime.
// Lo schema viene quindi ricostruito dal catalogo di Postgres, ma NON "a
// occhio": si usano `pg_get_constraintdef` e `pg_indexes.indexdef`, cioè le
// funzioni con cui Postgres stesso stampa le proprie definizioni. È la
// differenza fra ricostruire e chiedere a chi sa.
//
// COSA CONTIENE, e perché ognuna di queste parti serve davvero:
//  - CREATE SCHEMA per public e ogni tenant_*;
//  - CREATE TABLE con tipi, default e NOT NULL;
//  - INSERT di ogni riga;
//  - vincoli (PK, FK, UNIQUE, CHECK) applicati DOPO i dati, altrimenti
//    l'ordine di caricamento delle tabelle in relazione fra loro farebbe
//    fallire il ripristino;
//  - indici;
//  - setval() delle sequenze. Senza questo i SERIAL ripartono da 1 e la prima
//    riga inserita dopo il ripristino va in conflitto con quelle esistenti:
//    un difetto che si manifesta solo a ripristino avvenuto.
//
// CIFRATURA — il file contiene hash delle password, segreti TOTP, hash dei
// PIN e sessioni: è una copia della sicurezza a tre fattori. Con una
// passphrase viene cifrato AES-256-GCM riusando `portableCrypto.ts`, lo
// stesso meccanismo che protegge il database dell'edizione portable.

import fs from 'node:fs';
import path from 'node:path';
import { pool } from '@/lib/db';
import { cifra } from '@/lib/portableCrypto';
import { APP_VERSION } from '@/lib/appVersion';
import { intestazione, nomeFileBackup, type EsitoIntegrita } from '@/lib/backup/formato';
import { generaScriptBackup } from '@/lib/backup/genera';

export interface RisultatoBackup {
  success: boolean;
  /** Contenuto del file. Testo se in chiaro, base64 se cifrato. */
  contenuto?: string;
  cifrato?: boolean;
  nomeFile?: string;
  schemi?: number;
  tabelle?: number;
  righe?: number;
  byte?: number;
  /** Esito del controllo d'integrità: un backup non verificato è una promessa. */
  integrita?: EsitoIntegrita;
  /** Percorso su disco, se è stato scritto anche lì (edizione portable). */
  percorsoLocale?: string;
  error?: string;
}

export async function generaBackupCompletoAction(passphrase?: string): Promise<RisultatoBackup> {
  try {
    const quando = new Date();

    // La generazione sta in src/lib/backup/genera.ts, separata dal pool:
    // e' la stessa identica funzione che i test eseguono contro un PGlite
    // temporaneo, generando un backup e RIPRISTINANDOLO su un database
    // vuoto. Qui le si passa il pool di produzione. Un solo generatore, e
    // quel generatore e' provato.
    const g = await generaScriptBackup(async (sql, params) => {
      const r = params && params.length ? await pool.query(sql, params) : await pool.query(sql);
      return r.rows as Record<string, unknown>[];
    });

    const cifrato = !!passphrase && passphrase.length > 0;
    const testo =
      intestazione({
        versioneApp: APP_VERSION,
        generatoIl: quando.toISOString(),
        schemi: g.schemi.length,
        tabelle: g.inventario.length,
        righe: g.righeTotali,
        cifrato,
      }) +
      'BEGIN;\n\n' +
      g.sql +
      '\n\nCOMMIT;\n';

    const nomeFile = nomeFileBackup(APP_VERSION, quando, cifrato);
    const contenuto = cifrato
      ? cifra(Buffer.from(testo, 'utf8'), passphrase!).toString('base64')
      : testo;

    // Scrittura su disco solo dove un disco esiste davvero. Su Vercel il
    // filesystem e' effimero: scrivere li' non produrrebbe un backup, solo un
    // file che sparisce. Nel cloud l'unico "locale" possibile e' il PC di chi
    // opera, raggiunto dallo scaricamento lato interfaccia.
    let percorsoLocale: string | undefined;
    if (process.env.PORTABLE === '1') {
      try {
        const base =
          process.env.PORTABLE_BACKUP_DIR ||
          path.join(process.env.PORTABLE_DATA_DIR || process.cwd(), 'backup');
        fs.mkdirSync(base, { recursive: true });
        const percorso = path.join(base, nomeFile);
        // Scrittura atomica: un'interruzione a meta' lascerebbe altrimenti un
        // file troncato con l'aria di un backup buono.
        fs.writeFileSync(`${percorso}.tmp`, contenuto);
        fs.renameSync(`${percorso}.tmp`, percorso);
        percorsoLocale = percorso;
      } catch (e) {
        console.error('[backup] scrittura su disco non riuscita:', e);
      }
    }

    return {
      success: true,
      contenuto,
      cifrato,
      nomeFile,
      schemi: g.schemi.length,
      tabelle: g.inventario.length,
      righe: g.righeTotali,
      byte: Buffer.byteLength(contenuto),
      integrita: g.integrita,
      percorsoLocale,
    };
  } catch (error: unknown) {
    console.error('[generaBackupCompletoAction] Errore:', error);
    return { success: false, error: `Backup non riuscito: ${(error as Error).message}` };
  }
}
