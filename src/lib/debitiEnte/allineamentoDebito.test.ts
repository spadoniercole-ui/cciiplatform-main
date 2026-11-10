import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// Il riallineamento del debito memorizzato è la regola che lega una cifra alla
// verifica che l'ha prodotta. Si prova su un Postgres vero (PGlite): le tabelle
// sono quelle reali e le DELETE/INSERT girano davvero, non su un finto.

const db = await PGlite.create();

vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri) },
}));

// Le tabelle nascono nel beforeEach con le colonne che i moduli leggono; la
// provvigione completa non serve a questo test.
vi.mock('@/db/provision', () => ({
  assicuraTabellaDebitoEnteMemorizzato: async () => undefined,
  assicuraTabelleVera: async () => undefined,
}));

const {
  allineaDebitoEnteMemorizzato,
  azzeraDebitoEnteMemorizzato,
  leggiDebitoEnteMemorizzato,
  memorizzaDebitoEnte,
} = await import('./memorizzaDebitoEnte');

const SCHEMA = 'tenant_alfa';
const AZIENDA = 7;

beforeEach(async () => {
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.aziende (id INTEGER PRIMARY KEY);
    INSERT INTO ${SCHEMA}.aziende (id) VALUES (${AZIENDA});
    CREATE TABLE ${SCHEMA}.debiti_vera (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      sezione TEXT,
      ambito TEXT,
      voce TEXT,
      importo NUMERIC,
      contributi NUMERIC,
      sanzioni NUMERIC,
      categoria TEXT,
      stato TEXT,
      trattamento TEXT,
      periodo TEXT,
      duplicato_stato TEXT
    );
    CREATE TABLE ${SCHEMA}.debiti_triage (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      descrizione TEXT,
      categoria TEXT,
      importo_anno_corrente NUMERIC
    );
    CREATE TABLE ${SCHEMA}.debiti_ente_memorizzati (
      azienda_id INTEGER PRIMARY KEY,
      totale NUMERIC(16,2) NOT NULL,
      contabilizzato NUMERIC(16,2) NOT NULL DEFAULT 0,
      da_contabilizzare NUMERIC(16,2) NOT NULL DEFAULT 0,
      segnalato NUMERIC(16,2) NOT NULL DEFAULT 0,
      contributi NUMERIC(16,2) NOT NULL DEFAULT 0,
      sanzioni NUMERIC(16,2) NOT NULL DEFAULT 0,
      crediti_agente NUMERIC(16,2) NOT NULL DEFAULT 0,
      righe INTEGER NOT NULL DEFAULT 0,
      righe_segnalate INTEGER NOT NULL DEFAULT 0,
      ripartito BOOLEAN NOT NULL DEFAULT FALSE,
      sanzioni_non_distinte BOOLEAN NOT NULL DEFAULT FALSE,
      fonte TEXT NOT NULL,
      fonte_tipo TEXT NOT NULL DEFAULT 'certificazione',
      memorizzato_il TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
});

async function inserisciCertificazione(totale: number): Promise<void> {
  await db.query(
    `INSERT INTO ${SCHEMA}.debiti_vera
       (azienda_id, sezione, ambito, voce, importo, stato, trattamento, periodo)
     VALUES ($1, 'INPS', 'INPS', 'Contributi', $2, 'Verificata', 'contabilizzato', '2026-09')`,
    [AZIENDA, totale]
  );
}

async function totaleMemorizzato(): Promise<number | null> {
  const r = await db.query<{ totale: string | number }>(
    `SELECT totale FROM ${SCHEMA}.debiti_ente_memorizzati WHERE azienda_id = $1`,
    [AZIENDA]
  );
  if (r.rows.length === 0) return null;
  return Number(r.rows[0].totale);
}

describe('allineaDebitoEnteMemorizzato', () => {
  it('scrive la cifra quando gli archivi della verifica la portano', async () => {
    await inserisciCertificazione(120_000);

    const esito = await allineaDebitoEnteMemorizzato(SCHEMA, AZIENDA);

    expect(esito.azzerato).toBe(false);
    expect(esito.debito?.totale).toBe(120_000);
    expect(await totaleMemorizzato()).toBe(120_000);
  });

  it('toglie la cifra di una verifica archiviata quando il nuovo ciclo non ne ha', async () => {
    await inserisciCertificazione(120_000);
    await allineaDebitoEnteMemorizzato(SCHEMA, AZIENDA);
    expect(await totaleMemorizzato()).toBe(120_000);

    // Riapertura: il lavoro precedente va in archivio e le tabelle si svuotano.
    await db.query(`DELETE FROM ${SCHEMA}.debiti_vera WHERE azienda_id = $1`, [AZIENDA]);

    const dopo = await allineaDebitoEnteMemorizzato(SCHEMA, AZIENDA);

    expect(dopo).toEqual({ debito: null, azzerato: true });
    expect(await totaleMemorizzato()).toBeNull();
    expect(await leggiDebitoEnteMemorizzato(SCHEMA, AZIENDA)).toBeNull();
  });

  it('non dichiara di aver tolto nulla quando non c’era una cifra da togliere', async () => {
    const esito = await allineaDebitoEnteMemorizzato(SCHEMA, AZIENDA);

    expect(esito).toEqual({ debito: null, azzerato: false });
    expect(await totaleMemorizzato()).toBeNull();
  });
});

describe('memorizzaDebitoEnte (rinnovo esplicito)', () => {
  it('lascia la cifra precedente quando l’archivio è momentaneamente vuoto', async () => {
    await inserisciCertificazione(90_000);
    await memorizzaDebitoEnte(SCHEMA, AZIENDA);
    await db.query(`DELETE FROM ${SCHEMA}.debiti_vera WHERE azienda_id = $1`, [AZIENDA]);

    const esito = await memorizzaDebitoEnte(SCHEMA, AZIENDA);

    expect(esito).toBeNull();
    expect(await totaleMemorizzato()).toBe(90_000);
  });
});

describe('azzeraDebitoEnteMemorizzato', () => {
  it('dice se c’era una riga da togliere', async () => {
    expect(await azzeraDebitoEnteMemorizzato(SCHEMA, AZIENDA)).toBe(false);

    await inserisciCertificazione(50_000);
    await memorizzaDebitoEnte(SCHEMA, AZIENDA);
    expect(await azzeraDebitoEnteMemorizzato(SCHEMA, AZIENDA)).toBe(true);
    expect(await totaleMemorizzato()).toBeNull();
  });
});
