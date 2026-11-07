import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// Il caricamento della quinta azienda è SQL vero: la proviamo su Postgres in
// memoria (PGlite), con il resto del set demo svuotato. Così restano coperte
// la mappatura delle colonne e l'idempotenza del seed, che un test puro non
// vedrebbe.
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
  assicuraTabellaAziende: async () => undefined,
  assicuraTabellaXbrlAzienda: async () => undefined,
  assicuraTabelleScreeningAzienda: async () => undefined,
  assicuraTabellaDebitiEnte: async () => undefined,
  assicuraTabelleParametriSpazio: async () => undefined,
  assicuraTabelleScenari: async () => undefined,
  assicuraTabelleScenariTriage: async () => undefined,
  assicuraTabelleVera: async () => undefined,
}));

vi.mock('./percorsoEnte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./percorsoEnte')>();
  return { ...actual, PERCORSO_DEMO: [] };
});

const { caricaPercorsoDemoEnte } = await import('./caricaPercorsoEnte');

const SCHEMA = 'tenant_triage';

beforeEach(async () => {
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.aziende (
      id SERIAL PRIMARY KEY,
      ragione_sociale TEXT NOT NULL,
      codice_fiscale TEXT,
      partita_iva TEXT,
      codice_ateco TEXT,
      forma_giuridica TEXT,
      indirizzo_sede_legale TEXT,
      citta TEXT,
      provincia TEXT,
      cap TEXT,
      capitale_sociale NUMERIC,
      rappresentante_legale TEXT,
      ruolo_rappresentante_legale TEXT,
      numero_rea TEXT,
      pec TEXT,
      anno_costituzione INTEGER,
      in_verifica BOOLEAN NOT NULL DEFAULT FALSE,
      verifica_esito TEXT,
      verifica_eseguita_il TIMESTAMP,
      verifica_riferita_al DATE,
      con_lavoratori_subordinati BOOLEAN,
      contributi_scaduti NUMERIC,
      contributi_dovuti_anno_precedente NUMERIC,
      anno_contributi_dovuti INTEGER,
      volume_affari NUMERIC,
      ritardo_oltre_90_giorni BOOLEAN,
      periodi_in_ritardo INTEGER,
      soglie_aggiornate_al DATE
    );
    CREATE TABLE ${SCHEMA}.debiti_ente (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      voce TEXT NOT NULL,
      importo NUMERIC NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'DEBITO',
      note TEXT
    );
    CREATE TABLE ${SCHEMA}.debiti_vera (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      sezione TEXT NOT NULL,
      voce TEXT NOT NULL,
      importo NUMERIC NOT NULL DEFAULT 0,
      categoria TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT '',
      trattamento TEXT NOT NULL DEFAULT 'contabilizzato',
      periodo TEXT NOT NULL DEFAULT '',
      contributi NUMERIC,
      sanzioni NUMERIC,
      ambito TEXT NOT NULL DEFAULT 'INPS'
    );
  `);
});

describe('caricamento demo — quinta azienda al triage', () => {
  it('crea una sola azienda in verifica, con le posizioni e senza screening', async () => {
    const primo = await caricaPercorsoDemoEnte(SCHEMA, { soloPercorsi: true });

    expect(primo).toEqual({ creati: 1, esistenti: 0 });

    const aziende = await db.query<{
      id: number;
      ragione_sociale: string;
      in_verifica: boolean;
      verifica_esito: string | null;
      verifica_riferita_al: string | null;
      con_lavoratori_subordinati: boolean | null;
      volume_affari: string | null;
    }>(
      `SELECT id, ragione_sociale, in_verifica, verifica_esito,
              to_char(verifica_riferita_al, 'YYYY-MM-DD') AS verifica_riferita_al,
              con_lavoratori_subordinati, volume_affari
         FROM ${SCHEMA}.aziende`
    );

    expect(aziende.rows).toHaveLength(1);
    expect(aziende.rows[0]).toMatchObject({
      ragione_sociale: 'Impianti Adriatica Demo S.r.l.',
      in_verifica: true,
      verifica_esito: 'ATTENZIONE_MINIMA',
      verifica_riferita_al: '2026-11-05',
      con_lavoratori_subordinati: true,
      volume_affari: '1050000',
    });

    const posizioni = await db.query<{ voce: string; importo: string; tipo: string }>(
      `SELECT voce, importo, tipo FROM ${SCHEMA}.debiti_ente ORDER BY id`
    );
    expect(posizioni.rows).toEqual([
      { voce: 'Contributi previdenziali scaduti', importo: '45000', tipo: 'DEBITO' },
      { voce: 'Sanzioni civili contributive', importo: '6000', tipo: 'DEBITO' },
    ]);

    const certificazione = await db.query<{
      voce: string;
      contributi: string | null;
      sanzioni: string | null;
      trattamento: string;
      ambito: string;
    }>(
      `SELECT voce, contributi, sanzioni, trattamento, ambito
         FROM ${SCHEMA}.debiti_vera ORDER BY id`
    );
    expect(certificazione.rows).toEqual([
      {
        voce: 'Contributi previdenziali scaduti',
        contributi: '45000',
        sanzioni: null,
        trattamento: 'contabilizzato',
        ambito: 'INPS',
      },
      {
        voce: 'Sanzioni civili contributive',
        contributi: null,
        sanzioni: '6000',
        trattamento: 'contabilizzato',
        ambito: 'INPS',
      },
    ]);
  });

  it('non duplica la quinta azienda se il percorso viene ricaricato', async () => {
    await caricaPercorsoDemoEnte(SCHEMA, { soloPercorsi: true });
    const secondo = await caricaPercorsoDemoEnte(SCHEMA, { soloPercorsi: true });

    expect(secondo).toEqual({ creati: 0, esistenti: 1 });
    const aziende = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.aziende`
    );
    const posizioni = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.debiti_ente`
    );
    expect(aziende.rows[0].n).toBe(1);
    expect(posizioni.rows[0].n).toBe(2);
  });
});
