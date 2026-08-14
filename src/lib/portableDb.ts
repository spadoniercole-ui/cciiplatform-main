// src/lib/portableDb.ts
//
// Data layer dell'edizione PORTABLE. Un unico PGlite (Postgres in WASM,
// in-process) sostituisce il Postgres remoto: nessun server DB da
// installare. Il database vive cifrato su disco (vedi portableCrypto) e in
// chiaro solo in RAM. Espone due cose che il resto dell'app già usa:
//   - portablePool: interfaccia compatibile con il Pool di 'pg' (.query/.connect)
//   - portableDrizzle: istanza Drizzle (proxy, pronta dopo l'init)
// Attivo solo quando process.env.PORTABLE === '1'; il percorso cloud non è
// toccato. L'inizializzazione (asincrona: PGlite carica WASM) avviene una
// volta sola all'avvio del server, dal hook instrumentation.register().

import fs from 'node:fs';
import path from 'node:path';
import { cifra, decifra } from '@/lib/portableCrypto';

/* eslint-disable @typescript-eslint/no-explicit-any */

let pglite: any = null;
let drizzleInstance: any = null;
let inizializzazione: Promise<void> | null = null;
let dirty = false;
let dataFile = '';
let passphrase = '';

const MUTAZIONE = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|COMMENT|GRANT|REVOKE)/i;

function segnaModificato() {
  dirty = true;
}

async function persistiOra(): Promise<void> {
  if (!pglite) return;
  const dump = await pglite.dumpDataDir();
  const buf = Buffer.from(await dump.arrayBuffer());
  const enc = cifra(buf, passphrase);
  const tmp = dataFile + '.tmp';
  fs.writeFileSync(tmp, enc);
  fs.renameSync(tmp, dataFile); // scrittura atomica: mai un file a metà
  dirty = false;
}

/** Salvataggio periodico (solo se ci sono state modifiche) + alla chiusura
 * del processo. Il dump è di qualche MB: per un uso mono-utente locale un
 * autosave ogni pochi secondi è ampiamente sufficiente. */
function avviaAutosave() {
  const intervallo = Number(process.env.PORTABLE_AUTOSAVE_MS || 8000);
  const timer = setInterval(() => {
    if (dirty) persistiOra().catch((e) => console.error('[portableDb] autosave fallito:', e));
  }, intervallo);
  if (typeof timer.unref === 'function') timer.unref();

  const chiudi = async () => {
    try {
      if (dirty) await persistiOra();
    } catch (e) {
      console.error('[portableDb] persist finale fallito:', e);
    }
  };
  process.once('SIGINT', async () => {
    await chiudi();
    process.exit(0);
  });
  process.once('SIGTERM', async () => {
    await chiudi();
    process.exit(0);
  });
  process.once('beforeExit', chiudi);
}

export function portableDbPronto(): boolean {
  return !!pglite && !!drizzleInstance;
}

export async function initPortableDb(): Promise<void> {
  if (pglite) return;
  if (inizializzazione) return inizializzazione;
  inizializzazione = (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');

    const dataDir = process.env.PORTABLE_DATA_DIR || path.join(process.cwd(), 'dati');
    dataFile = process.env.PORTABLE_DB_FILE || path.join(dataDir, 'ccii.db.enc');
    passphrase = process.env.PORTABLE_PASSPHRASE || '';
    if (!passphrase) {
      throw new Error(
        'PORTABLE_PASSPHRASE mancante: l’edizione portable richiede una passphrase per cifrare il database.'
      );
    }
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });

    let fresco = false;
    if (fs.existsSync(dataFile)) {
      const enc = fs.readFileSync(dataFile);
      let plain: Buffer;
      try {
        plain = decifra(enc, passphrase);
      } catch {
        throw new Error(
          'Passphrase errata o database danneggiato: impossibile aprire il database cifrato.'
        );
      }
      pglite = await PGlite.create({ loadDataDir: new Blob([new Uint8Array(plain)]) });
    } else {
      pglite = await PGlite.create();
      fresco = true;
    }
    drizzleInstance = drizzle(pglite);
    avviaAutosave();

    // Tabelle globali di sistema (schema public) garantite ad OGNI avvio,
    // idempotenti: così anche un database creato da una versione
    // precedente — priva, ad es., della tabella `sessioni` — si
    // auto-ripara senza perdere i dati esistenti.
    const et = await import('@/db/ensureTables');
    await et.assicuraTabellaSessioni();
    await et.assicuraTabelleSpazi();
    await et.assicuraIndiceAdminSpazio();
    await et.assicuraIndiceUtenteSpazio();

    if (fresco) {
      const { bootstrapPortable } = await import('@/lib/portableBootstrap');
      await bootstrapPortable();
    }
    await persistiOra();
  })();
  return inizializzazione;
}

function normalizzaRisultato(r: any) {
  const rows = r?.rows ?? [];
  const rowCount = typeof r?.affectedRows === 'number' ? r.affectedRows : rows.length;
  return { rows, rowCount, fields: r?.fields ?? [] };
}

async function eseguiQuery(text: string, params?: any[]) {
  if (!pglite) await initPortableDb();
  if (params && params.length) {
    return normalizzaRisultato(await pglite.query(text, params));
  }
  try {
    return normalizzaRisultato(await pglite.query(text));
  } catch (e: any) {
    // PGlite.query gestisce una singola istruzione: se il testo ne contiene
    // più d'una (raro nel codice, che segue la disciplina "un DDL per query"),
    // si ripiega su exec.
    if (/cannot insert multiple commands|multiple statements|syntax/i.test(String(e?.message))) {
      await pglite.exec(text);
      return { rows: [], rowCount: 0, fields: [] };
    }
    throw e;
  }
}

/** Interfaccia compatibile con il Pool di 'pg' usata in ~230 punti del
 * codice. query() risolve da solo l'init asincrono di PGlite. connect()
 * restituisce un client dove BEGIN/COMMIT/ROLLBACK sono normali query
 * (PGlite è a connessione singola, in-process). */
export const portablePool = {
  async query(text: string, params?: any[]) {
    if (MUTAZIONE.test(text)) segnaModificato();
    return eseguiQuery(text, params);
  },
  async connect() {
    if (!pglite) await initPortableDb();
    return {
      async query(text: string, params?: any[]) {
        if (MUTAZIONE.test(text)) segnaModificato();
        return eseguiQuery(text, params);
      },
      release() {
        /* no-op: connessione singola in-process */
      },
    };
  },
  async end() {
    if (dirty) await persistiOra();
  },
};

/** Proxy Drizzle: l'istanza reale è pronta dopo initPortableDb() (chiamato
 * all'avvio da instrumentation). Intercetta i metodi di scrittura per
 * segnare il DB come "modificato" e far scattare l'autosave. */
export const portableDrizzle: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (['insert', 'update', 'delete', 'execute', 'transaction'].includes(prop)) {
        segnaModificato();
      }
      if (!drizzleInstance) {
        throw new Error(
          '[portableDb] Drizzle non ancora inizializzato (init all’avvio non completato).'
        );
      }
      const v = drizzleInstance[prop];
      return typeof v === 'function' ? v.bind(drizzleInstance) : v;
    },
  }
);
