import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// L'acquisizione demo tocca SQL vero: la proviamo su Postgres in memoria
// (PGlite), con la guardia di accesso fuori dal perimetro. È il punto che un
// test puro non copre: colonne sbagliate o una copia che duplica le righe si
// vedrebbero solo qui.
const db = await PGlite.create();

const client = {
  query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri),
  release: () => undefined,
};

vi.mock('@/lib/db', () => ({
  pool: {
    query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri),
    connect: async () => client,
  },
}));

vi.mock('@/db/provision', () => ({
  assicuraTabellaDebitiEnte: async (nomeSchema: string) => {
    await db.exec(`CREATE TABLE IF NOT EXISTS "${nomeSchema}".debiti_ente (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      scenario_id INTEGER,
      voce TEXT NOT NULL,
      importo NUMERIC NOT NULL DEFAULT 0,
      importo_versato NUMERIC,
      tipo TEXT NOT NULL DEFAULT 'DEBITO',
      note TEXT,
      data DATE,
      dati_extra JSONB,
      tracciato_id INTEGER,
      codice_guida TEXT,
      documento_id INTEGER
    )`);
  },
  assicuraTabellaAziende: async () => undefined,
  assicuraTabellaXbrlAzienda: async () => undefined,
  assicuraTabelleScreeningAzienda: async () => undefined,
  assicuraTabelleParametriSpazio: async () => undefined,
  assicuraTabelleScenari: async () => undefined,
  assicuraTabelleScenariTriage: async () => undefined,
}));

const { acquisisciPosizioneDebitoriaDemoEnte } = await import('./caricaPercorsoEnte');

const SCHEMA = 'tenant_demo';
const AZIENDA = 7;
const SCENARIO = 11;

beforeEach(async () => {
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.aziende (id SERIAL PRIMARY KEY, ragione_sociale TEXT NOT NULL);
    CREATE TABLE ${SCHEMA}.scenari (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      nome TEXT NOT NULL
    );
    CREATE TABLE ${SCHEMA}.debiti_ente (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      scenario_id INTEGER,
      voce TEXT NOT NULL,
      importo NUMERIC NOT NULL DEFAULT 0,
      importo_versato NUMERIC,
      tipo TEXT NOT NULL DEFAULT 'DEBITO',
      note TEXT,
      data DATE,
      dati_extra JSONB,
      tracciato_id INTEGER,
      codice_guida TEXT,
      documento_id INTEGER
    );

    DROP TABLE IF EXISTS public.spazi;
    CREATE TABLE public.spazi (
      nome_schema TEXT PRIMARY KEY,
      demo BOOLEAN NOT NULL DEFAULT FALSE
    );
    INSERT INTO public.spazi (nome_schema, demo) VALUES ('${SCHEMA}', TRUE);

    INSERT INTO ${SCHEMA}.aziende (id, ragione_sociale)
      VALUES (${AZIENDA}, 'Logistica Padana Demo S.r.l.');
    INSERT INTO ${SCHEMA}.scenari (id, azienda_id, nome)
      VALUES (${SCENARIO}, ${AZIENDA}, 'Cram down — Logistica Padana Demo');
    INSERT INTO ${SCHEMA}.debiti_ente (azienda_id, scenario_id, voce, importo, tipo, note)
      VALUES
        (${AZIENDA}, NULL, 'Contributi previdenziali scaduti', 12000, 'DEBITO', 'demo'),
        (${AZIENDA}, NULL, 'Sanzioni civili contributive', 1500, 'DEBITO', 'demo');
  `);
});

describe('acquisizione della posizione debitoria demo', () => {
  it('copia la certificazione nello scenario senza spostarla dall’azienda', async () => {
    const esito = await acquisisciPosizioneDebitoriaDemoEnte(SCHEMA, AZIENDA, SCENARIO);

    expect(esito).toEqual({ righe: 2, totale: 13_500, giaPresenti: false });
    const scenario = await db.query<{ importo: string }>(
      `SELECT importo FROM "${SCHEMA}".debiti_ente WHERE scenario_id = $1 ORDER BY id`,
      [SCENARIO]
    );
    expect(scenario.rows).toHaveLength(2);
    expect(Number(scenario.rows[0].importo)).toBe(12_000);

    // Copia, non spostamento: l'azienda conserva la sua certificazione.
    const azienda = await db.query(
      `SELECT id FROM "${SCHEMA}".debiti_ente
        WHERE azienda_id = $1 AND scenario_id IS NULL`,
      [AZIENDA]
    );
    expect(azienda.rows).toHaveLength(2);
  });

  it('non duplica la posizione se lo scenario la contiene già', async () => {
    await acquisisciPosizioneDebitoriaDemoEnte(SCHEMA, AZIENDA, SCENARIO);
    const secondo = await acquisisciPosizioneDebitoriaDemoEnte(SCHEMA, AZIENDA, SCENARIO);

    expect(secondo.giaPresenti).toBe(true);
    expect(secondo.righe).toBe(2);
    const scenario = await db.query(
      `SELECT id FROM "${SCHEMA}".debiti_ente WHERE scenario_id = $1`,
      [SCENARIO]
    );
    expect(scenario.rows).toHaveLength(2);
  });

  it('se l’azienda non ha più righe, ricostruisce la certificazione dai dati demo', async () => {
    await db.exec(
      `DELETE FROM "${SCHEMA}".debiti_ente WHERE azienda_id = ${AZIENDA} AND scenario_id IS NULL`
    );

    const esito = await acquisisciPosizioneDebitoriaDemoEnte(SCHEMA, AZIENDA, SCENARIO);

    expect(esito).toMatchObject({ righe: 2, totale: 13_500, giaPresenti: false });
    const scenario = await db.query<{ note: string }>(
      `SELECT note FROM "${SCHEMA}".debiti_ente WHERE scenario_id = $1 ORDER BY id`,
      [SCENARIO]
    );
    expect(scenario.rows).toHaveLength(2);
    expect(scenario.rows[0].note).toContain('demo');
  });

  it('rifiuta l’acquisizione fuori da uno spazio demo', async () => {
    await db.exec(`UPDATE public.spazi SET demo = FALSE WHERE nome_schema = '${SCHEMA}'`);
    await expect(acquisisciPosizioneDebitoriaDemoEnte(SCHEMA, AZIENDA, SCENARIO)).rejects.toThrow(
      /spazi demo/
    );
  });

  it('rifiuta uno scenario che non appartiene all’azienda', async () => {
    await expect(acquisisciPosizioneDebitoriaDemoEnte(SCHEMA, AZIENDA, 999)).rejects.toThrow(
      /Scenario non trovato/
    );
  });
});
