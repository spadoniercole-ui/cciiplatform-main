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

// ---------------------------------------------------------------------------
// STATO CONDIVISO A LIVELLO DI PROCESSO (non a livello di modulo)
//
// Next.js compila l'applicazione in PIU' GRAFI DI MODULI separati che
// convivono nello stesso processo Node: l'hook di instrumentation, le
// Server Action e i Server Component non condividono la stessa copia di
// un modulo. Con lo stato tenuto in variabili di modulo (`let pglite`),
// ognuno di questi grafi otteneva la PROPRIA istanza di PGlite: misurate
// TRE istanze distinte nello stesso processo.
//
// Conseguenze osservate in sandbox: la sessione scritta dal login (una
// istanza) risultava inesistente al controllo d'accesso della pagina
// (un'altra istanza), e l'accesso rimbalzava senza alcun messaggio. Ma il
// login era solo il sintomo piu' visibile: due o piu' istanze che scrivono
// a turno lo stesso file cifrato si sovrascrivono a vicenda, e l'ultimo
// salvataggio cancella in silenzio il lavoro degli altri. Su un prodotto
// che gira da chiavetta e tiene i dati di una crisi d'impresa, e' una
// perdita di dati, non un fastidio.
//
// Rimedio: un solo contenitore di stato appeso a `globalThis` con chiave
// `Symbol.for`. Tutte le copie del modulo, in qualunque grafo si trovino,
// vedono lo STESSO oggetto — quindi la stessa, unica istanza di PGlite.
// ---------------------------------------------------------------------------

type StatoPortable = {
  pglite: any;
  drizzleInstance: any;
  inizializzazione: Promise<void> | null;
  dirty: boolean;
  dataFile: string;
  passphrase: string;
  autosaveAvviato: boolean;
};

const CHIAVE_GLOBALE = Symbol.for('cciiplatform.portableDb.stato');

function statoCondiviso(): StatoPortable {
  const g = globalThis as unknown as Record<symbol, StatoPortable | undefined>;
  if (!g[CHIAVE_GLOBALE]) {
    g[CHIAVE_GLOBALE] = {
      pglite: null,
      drizzleInstance: null,
      inizializzazione: null,
      dirty: false,
      dataFile: '',
      passphrase: '',
      autosaveAvviato: false,
    };
  }
  return g[CHIAVE_GLOBALE] as StatoPortable;
}

const stato = statoCondiviso();

const MUTAZIONE = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|COMMENT|GRANT|REVOKE)/i;

function segnaModificato() {
  stato.dirty = true;
}

async function persistiOra(): Promise<void> {
  if (!stato.pglite) return;
  const dump = await stato.pglite.dumpDataDir();
  const buf = Buffer.from(await dump.arrayBuffer());
  const enc = cifra(buf, stato.passphrase);
  const tmp = stato.dataFile + '.tmp';
  fs.writeFileSync(tmp, enc);
  fs.renameSync(tmp, stato.dataFile); // scrittura atomica: mai un file a metà
  stato.dirty = false;
}

/** Salvataggio periodico (solo se ci sono state modifiche) + alla chiusura
 * del processo. Il dump è di qualche MB: per un uso mono-utente locale un
 * autosave ogni pochi secondi è ampiamente sufficiente. */
function avviaAutosave() {
  // Una sola volta per processo: senza questa guardia ogni copia del modulo
  // installerebbe il proprio timer e i propri handler di chiusura.
  if (stato.autosaveAvviato) return;
  stato.autosaveAvviato = true;

  const intervallo = Number(process.env.PORTABLE_AUTOSAVE_MS || 8000);
  const timer = setInterval(() => {
    if (stato.dirty) persistiOra().catch((e) => console.error('[portableDb] autosave fallito:', e));
  }, intervallo);
  if (typeof timer.unref === 'function') timer.unref();

  const chiudi = async () => {
    try {
      if (stato.dirty) await persistiOra();
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
  return !!stato.pglite && !!stato.drizzleInstance;
}

export async function initPortableDb(): Promise<void> {
  if (stato.pglite) return;
  if (stato.inizializzazione) return stato.inizializzazione;
  stato.inizializzazione = (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');

    const dataDir = process.env.PORTABLE_DATA_DIR || path.join(process.cwd(), 'dati');
    stato.dataFile = process.env.PORTABLE_DB_FILE || path.join(dataDir, 'ccii.db.enc');
    stato.passphrase = process.env.PORTABLE_PASSPHRASE || '';
    if (!stato.passphrase) {
      throw new Error(
        'PORTABLE_PASSPHRASE mancante: l’edizione portable richiede una passphrase per cifrare il database.'
      );
    }
    fs.mkdirSync(path.dirname(stato.dataFile), { recursive: true });

    let fresco = false;
    if (fs.existsSync(stato.dataFile)) {
      const enc = fs.readFileSync(stato.dataFile);
      let plain: Buffer;
      try {
        plain = decifra(enc, stato.passphrase);
      } catch {
        throw new Error(
          'Passphrase errata o database danneggiato: impossibile aprire il database cifrato.'
        );
      }
      stato.pglite = await PGlite.create({ loadDataDir: new Blob([new Uint8Array(plain)]) });
    } else {
      stato.pglite = await PGlite.create();
      fresco = true;
    }
    stato.drizzleInstance = drizzle(stato.pglite);
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
  return stato.inizializzazione;
}

function normalizzaRisultato(r: any) {
  const rows = r?.rows ?? [];
  const rowCount = typeof r?.affectedRows === 'number' ? r.affectedRows : rows.length;
  return { rows, rowCount, fields: r?.fields ?? [] };
}

async function eseguiQuery(text: string, params?: any[]) {
  if (!stato.pglite) await initPortableDb();
  if (params && params.length) {
    return normalizzaRisultato(await stato.pglite.query(text, params));
  }
  try {
    return normalizzaRisultato(await stato.pglite.query(text));
  } catch (e: any) {
    // PGlite.query gestisce una singola istruzione: se il testo ne contiene
    // più d'una (raro nel codice, che segue la disciplina "un DDL per query"),
    // si ripiega su exec.
    if (/cannot insert multiple commands|multiple statements|syntax/i.test(String(e?.message))) {
      await stato.pglite.exec(text);
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
    if (!stato.pglite) await initPortableDb();
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
    if (stato.dirty) await persistiOra();
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
      if (!stato.drizzleInstance) {
        throw new Error(
          '[portableDb] Drizzle non ancora inizializzato (init all’avvio non completato).'
        );
      }
      const v = stato.drizzleInstance[prop];
      return typeof v === 'function' ? v.bind(stato.drizzleInstance) : v;
    },
  }
);
