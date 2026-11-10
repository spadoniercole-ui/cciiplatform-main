// @vitest-environment node
//
// L'AZIONE CHE CAMBIA LA SITUAZIONE, PROVATA SUL DATABASE.
//
// Le guardie sono simulate (sono le uniche cose che non si possono provare su
// un Postgres di test), il resto è codice di produzione: SELECT, UPDATE,
// derivazione dell'origine, ritorno allo stato di bozza e conteggio dei passi
// da rivedere. PGlite dice se il dato resta al suo posto: il cambio non
// cancella nulla.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const db = await PGlite.create();

vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri) },
}));

const richiediAccessoScenario = vi.fn(async () => ({ modalita: 'ADMIN_SPAZIO' as const }));
vi.mock('@/lib/autorizzazione', () => ({ richiediAccessoScenario }));

const { aggiornaSituazioneScenarioAction } = await import('./scenari');

const SCHEMA = 'tenant_prova_situazione';
const SCENARIO = 1;

async function riga() {
  const r = await db.query(`SELECT * FROM ${SCHEMA}.scenari WHERE id = $1`, [SCENARIO]);
  return r.rows[0] as Record<string, unknown>;
}

beforeEach(async () => {
  richiediAccessoScenario.mockReset();
  richiediAccessoScenario.mockResolvedValue({ modalita: 'ADMIN_SPAZIO' } as never);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    DROP TABLE IF EXISTS public.spazi;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE public.spazi (
      nome_schema TEXT PRIMARY KEY,
      tipo_spazio TEXT,
      demo BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE ${SCHEMA}.aziende (id SERIAL PRIMARY KEY, ragione_sociale TEXT);
    CREATE TABLE ${SCHEMA}.scenari (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT 'BOZZA',
      tipo_proposta TEXT NOT NULL DEFAULT 'RICEVUTA',
      origine_proposta TEXT NOT NULL DEFAULT 'Azienda',
      tipo_istruttoria TEXT NOT NULL DEFAULT 'PROPOSTA',
      situazione_cambiata_il TIMESTAMP,
      bloccato_il TIMESTAMP
    );
    CREATE TABLE ${SCHEMA}.proposta_creditori (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER,
      categoria_creditore TEXT
    );
    CREATE TABLE ${SCHEMA}.checklist_risposte (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER,
      domanda_id TEXT,
      risposta BOOLEAN
    );
    INSERT INTO public.spazi (nome_schema, tipo_spazio, demo)
      VALUES ('${SCHEMA}', 'ENTE', FALSE);
    INSERT INTO ${SCHEMA}.aziende (id, ragione_sociale) VALUES (1, 'Alfa Srl');
    INSERT INTO ${SCHEMA}.scenari
      (id, azienda_id, nome, stato, tipo_proposta, origine_proposta, tipo_istruttoria)
      VALUES (${SCENARIO}, 1, 'Ipotesi', 'IN_CORSO', 'RICEVUTA', 'Azienda', 'PROPOSTA');
    INSERT INTO ${SCHEMA}.proposta_creditori (scenario_id, categoria_creditore)
      VALUES (${SCENARIO}, 'INPS'), (${SCENARIO}, 'Agenzia Entrate');
    INSERT INTO ${SCHEMA}.checklist_risposte (scenario_id, domanda_id, risposta)
      VALUES (${SCENARIO}, '1.1', TRUE), (${SCENARIO}, '1.2', FALSE), (${SCENARIO}, '2.1', NULL);
  `);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('aggiornaSituazioneScenarioAction', () => {
  it('ENTE, decreto: origine Tribunale, scenario in bozza e passi da rivedere', async () => {
    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'DECRETO_LIQUIDAZIONE');

    expect(esito.success).toBe(true);
    expect(esito.rivedere).toEqual([
      'Proposta: 2 righe di creditori da ricontrollare',
      'Check List: 2 risposte da riconfermare',
    ]);
    const r = await riga();
    expect(r.tipo_istruttoria).toBe('DECRETO_LIQUIDAZIONE');
    expect(r.origine_proposta).toBe('Tribunale');
    expect(r.stato).toBe('BOZZA');
    expect(r.situazione_cambiata_il).not.toBeNull();
  });

  it('la guardia viene prima di tutto: se rifiuta, il dato non si tocca', async () => {
    richiediAccessoScenario.mockRejectedValueOnce(new Error('Accesso negato'));

    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'CRAM_DOWN');

    expect(esito.success).toBe(false);
    const r = await riga();
    expect(r.tipo_istruttoria).toBe('PROPOSTA');
    expect(r.stato).toBe('IN_CORSO');
  });

  it('uno scenario bloccato resta in sola lettura', async () => {
    await db.query(`UPDATE ${SCHEMA}.scenari SET bloccato_il = now() WHERE id = $1`, [SCENARIO]);

    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'CRAM_DOWN');

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/sola lettura permanente/);
    expect((await riga()).tipo_istruttoria).toBe('PROPOSTA');
  });

  it('in demo i percorsi sono predisposti e non si cambiano', async () => {
    await db.query(`UPDATE public.spazi SET demo = TRUE WHERE nome_schema = $1`, [SCHEMA]);

    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'CRAM_DOWN');

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/demo/);
    expect((await riga()).tipo_istruttoria).toBe('PROPOSTA');
  });

  it('per un redigente l’origine dichiarata non viene riscritta', async () => {
    await db.query(`UPDATE public.spazi SET tipo_spazio = 'RED' WHERE nome_schema = $1`, [SCHEMA]);
    await db.query(
      `UPDATE ${SCHEMA}.scenari SET tipo_istruttoria = 'DECRETO_LIQUIDAZIONE', origine_proposta = 'Studio' WHERE id = $1`,
      [SCENARIO]
    );

    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'PROPOSTA');

    expect(esito.success).toBe(true);
    const r = await riga();
    expect(r.tipo_istruttoria).toBe('PROPOSTA');
    expect(r.origine_proposta).toBe('Studio');
  });

  it('rifiuta una situazione non riconosciuta', async () => {
    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'DA_CHIEDERE' as never);

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/non riconosciuta/);
  });

  it('se la situazione è già quella non risveglia la bozza né segnala passi', async () => {
    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'PROPOSTA');

    expect(esito.success).toBe(true);
    expect(esito.rivedere).toEqual([]);
    const r = await riga();
    expect(r.stato).toBe('IN_CORSO');
    expect(r.situazione_cambiata_il).toBeNull();
  });
});
