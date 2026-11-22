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
    CREATE TABLE ${SCHEMA}.debiti_ente (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      scenario_id INTEGER,
      voce TEXT NOT NULL,
      importo NUMERIC NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'DEBITO'
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

  it('rilegge le posizioni dell’ente quando certificazione e triage non ne hanno', async () => {
    // È il caso della demo: le posizioni del percorso stanno in `debiti_ente`,
    // non in `debiti_vera`. Prima il riallineamento le ignorava e toglieva la
    // cifra, lasciando il ritratto con «nessun debito memorizzato».
    await db.query(
      `INSERT INTO ${SCHEMA}.debiti_ente (azienda_id, voce, importo, tipo) VALUES
         ($1, 'Contributi previdenziali scaduti', 80000, 'DEBITO'),
         ($1, 'Sanzioni civili contributive', 12000, 'DEBITO'),
         ($1, 'Contributi 2026 maturati e non versati', 60000, 'DEBITO')`,
      [AZIENDA]
    );

    const esito = await allineaDebitoEnteMemorizzato(SCHEMA, AZIENDA);

    expect(esito.azzerato).toBe(false);
    expect(esito.debito?.totale).toBe(152_000);
    expect(esito.debito?.contributi).toBe(140_000);
    expect(esito.debito?.sanzioni).toBe(12_000);
    expect(esito.debito?.fonteTipo).toBe('posizioni');
    expect(esito.debito?.ripartito).toBe(false);
    expect(await totaleMemorizzato()).toBe(152_000);

    // E il secondo riallineamento non tocca la cifra: è ricavabile, non muore.
    const dopo = await allineaDebitoEnteMemorizzato(SCHEMA, AZIENDA);
    expect(dopo.azzerato).toBe(false);
    expect(await totaleMemorizzato()).toBe(152_000);
  });

  it('non conta due volte le posizioni copiate su uno scenario', async () => {
    await db.query(
      `INSERT INTO ${SCHEMA}.debiti_ente (azienda_id, scenario_id, voce, importo) VALUES
         ($1, NULL, 'Contributi previdenziali scaduti', 80000),
         ($1, 4, 'Contributi previdenziali scaduti', 80000)`,
      [AZIENDA]
    );

    const esito = await allineaDebitoEnteMemorizzato(SCHEMA, AZIENDA);

    expect(esito.debito?.totale).toBe(80_000);
    expect(esito.debito?.righe).toBe(1);
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
