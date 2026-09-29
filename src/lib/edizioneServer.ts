// src/lib/edizioneServer.ts
//
// Impostazioni che distinguono le tre edizioni della piattaforma:
//   - cloud (Vercel + Postgres gestito + Vercel Blob): comportamento storico;
//   - portable (PORTABLE=1): PGlite cifrato e file nella cartella dati;
//   - server on-premise (EDIZIONE_SERVER=1, vedi docs/INSTALLAZIONE-SERVER.md):
//     stessa piattaforma del cloud (multi-spazio, superadmin, licenze) sul
//     server dell'ente, con Postgres locale e file su disco.
//
// Funzioni pure sull'ambiente, così sono verificabili nei test.
import path from 'node:path';

type Ambiente = NodeJS.ProcessEnv;

const DISATTIVO = new Set(['0', 'false', 'no', 'off', 'disable']);

/** Edizione server on-premise attiva? */
export function edizioneServer(env: Ambiente = process.env): boolean {
  return env.EDIZIONE_SERVER === '1';
}

/**
 * Opzione `ssl` per il Pool di `pg`.
 *
 * Predefinito (cloud): TLS senza verifica del certificato, come sempre.
 * DATABASE_SSL=0 → connessione in chiaro (Postgres sulla stessa macchina o
 * nella rete interna di Docker, dove TLS non è configurato).
 * DATABASE_SSL=verify → TLS con verifica del certificato del server.
 */
export function sslDatabase(env: Ambiente = process.env): false | { rejectUnauthorized: boolean } {
  const v = (env.DATABASE_SSL || '').trim().toLowerCase();
  if (DISATTIVO.has(v)) return false;
  if (v === 'verify') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/**
 * Cartella in cui salvare i file caricati, se si usa il disco locale invece
 * di Vercel Blob; `null` = Vercel Blob.
 *
 * Portable: <PORTABLE_DATA_DIR>/blobs. Altrove: ARCHIVIO_FILE_DIR, se
 * impostata (edizione server, o anche un cloud senza Vercel Blob).
 */
export function cartellaArchivioLocale(env: Ambiente = process.env): string | null {
  if (env.PORTABLE === '1') {
    return path.join(env.PORTABLE_DATA_DIR || path.join(process.cwd(), 'dati'), 'blobs');
  }
  const dir = (env.ARCHIVIO_FILE_DIR || '').trim();
  return dir ? path.resolve(dir) : null;
}

/**
 * Cartella in cui il backup generato dall'interfaccia viene ANCHE salvato
 * sul server; `null` = solo scaricamento dal browser (cloud: il filesystem di
 * Vercel è effimero, un file scritto lì sparirebbe).
 */
export function cartellaBackupServer(env: Ambiente = process.env): string | null {
  if (env.PORTABLE === '1') {
    return env.PORTABLE_BACKUP_DIR || path.join(env.PORTABLE_DATA_DIR || process.cwd(), 'backup');
  }
  const dir = (env.BACKUP_DIR || '').trim();
  return dir ? path.resolve(dir) : null;
}

/**
 * Dimensione massima di un PDF caricato tramite /api/blob-upload. Su Vercel
 * il corpo della richiesta ha un tetto infrastrutturale di 4,5MB; con
 * l'archivio su disco quel tetto non esiste e si allinea ai 20MB già
 * ammessi dalla Simulazione Ricevente.
 */
export function limiteUploadByte(env: Ambiente = process.env): number {
  return cartellaArchivioLocale(env) ? 20 * 1024 * 1024 : 4 * 1024 * 1024;
}
