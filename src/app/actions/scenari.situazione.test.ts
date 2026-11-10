// @vitest-environment node
//
// CAMBIARE E ANNULLARE LA SITUAZIONE, PROVATI SUL DATABASE.
//
// Le guardie sono simulate (sono le uniche cose che non si possono provare su
// un Postgres di test), il resto è codice di produzione: SELECT, UPDATE,
// derivazione dell'origine, ritorno allo stato di bozza, conteggio dei passi
// da rivedere e righe di cronologia. PGlite dice se il dato resta al suo
// posto: né il cambio né l'annullamento cancellano il lavoro fatto.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const db = await PGlite.create();

vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri) },
}));

const richiediAccessoScenario = vi.fn(async () => ({ modalita: 'ADMIN_SPAZIO' as const }));
vi.mock('@/lib/autorizzazione', () => ({ richiediAccessoScenario }));

vi.mock('@/db/provision', () => ({
  assicuraStoricoSituazione: async () => undefined,
  assicuraTabelleScenari: async () => undefined,
}));

const { aggiornaSituazioneScenarioAction, annullaUltimoCambioSituazioneAction } =
  await import('./scenari');
const { leggiStoricoSituazione } = await import('@/lib/scenari/storicoSituazione');

const SCHEMA = 'tenant_prova_situazione';
const SCENARIO = 1;

async function riga() {
  const r = await db.query(`SELECT * FROM ${SCHEMA}.scenari WHERE id = $1`, [SCENARIO]);
  return r.rows[0] as Record<string, unknown>;
}

async function storico() {
  const r = await db.query(
    `SELECT da, a, autore, annullato_il, annullato_da FROM ${SCHEMA}.situazione_storico WHERE scenario_id = $1 ORDER BY id`,
    [SCENARIO]
  );
  return r.rows as {
    da: string | null;
    a: string;
    autore: string | null;
    annullato_il: Date | null;
    annullato_da: string | null;
  }[];
}

beforeEach(async () => {
  richiediAccessoScenario.mockReset();
  richiediAccessoScenario.mockResolvedValue({
    modalita: 'ADMIN_SPAZIO',
    email: 'anna@alfa.it',
  } as never);
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
    CREATE TABLE ${SCHEMA}.situazione_storico (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL,
      da TEXT,
      a TEXT NOT NULL,
      cambiata_il TIMESTAMP NOT NULL DEFAULT now(),
      annullato_il TIMESTAMP,
      autore TEXT,
      annullato_da TEXT
    );
    CREATE TABLE ${SCHEMA}.scenario_sblocchi (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      sbloccato_da TEXT,
      sbloccato_il TIMESTAMP NOT NULL DEFAULT now()
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
  it('ENTE, decreto: origine Tribunale, scenario in bozza, passi e cronologia', async () => {
    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'DECRETO_LIQUIDAZIONE');

    expect(esito.success).toBe(true);
    expect((await storico())[0].autore).toBe('anna@alfa.it');
    expect(esito.rivedere).toEqual([
      'Proposta: 2 righe di creditori da ricontrollare',
      'Check List: 2 risposte da riconfermare',
    ]);
    const r = await riga();
    expect(r.tipo_istruttoria).toBe('DECRETO_LIQUIDAZIONE');
    expect(r.origine_proposta).toBe('Tribunale');
    expect(r.stato).toBe('BOZZA');
    expect(r.situazione_cambiata_il).not.toBeNull();

    expect((await storico())[0]).toMatchObject({ da: 'PROPOSTA', a: 'DECRETO_LIQUIDAZIONE' });
    const letto = await leggiStoricoSituazione(SCHEMA, SCENARIO);
    expect(letto).toHaveLength(1);
    expect(letto[0].da).toBe('PROPOSTA');
    expect(letto[0].a).toBe('DECRETO_LIQUIDAZIONE');
    expect(letto[0].annullatoIl).toBeNull();
  });

  it('la guardia viene prima di tutto: se rifiuta, il dato non si tocca', async () => {
    richiediAccessoScenario.mockRejectedValueOnce(new Error('Accesso negato'));

    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'CRAM_DOWN');

    expect(esito.success).toBe(false);
    const r = await riga();
    expect(r.tipo_istruttoria).toBe('PROPOSTA');
    expect(r.stato).toBe('IN_CORSO');
    expect(await storico()).toEqual([]);
  });

  it('uno scenario bloccato resta in sola lettura', async () => {
    await db.query(`UPDATE ${SCHEMA}.scenari SET bloccato_il = now() WHERE id = $1`, [SCENARIO]);

    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'CRAM_DOWN');

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/sola lettura permanente/);
    expect((await riga()).tipo_istruttoria).toBe('PROPOSTA');
    expect(await storico()).toEqual([]);
  });

  it('in demo i percorsi sono predisposti e non si cambiano', async () => {
    await db.query(`UPDATE public.spazi SET demo = TRUE WHERE nome_schema = $1`, [SCHEMA]);

    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'CRAM_DOWN');

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/demo/);
    expect((await riga()).tipo_istruttoria).toBe('PROPOSTA');
    expect(await storico()).toEqual([]);
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
    expect((await storico())[0]).toMatchObject({ da: 'DECRETO_LIQUIDAZIONE', a: 'PROPOSTA' });
  });

  it('rifiuta una situazione non riconosciuta', async () => {
    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'DA_CHIEDERE' as never);

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/non riconosciuta/);
    expect(await storico()).toEqual([]);
  });

  it('se la situazione è già quella non risveglia la bozza né scrive cronologia', async () => {
    const esito = await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'PROPOSTA');

    expect(esito.success).toBe(true);
    expect(esito.rivedere).toEqual([]);
    const r = await riga();
    expect(r.stato).toBe('IN_CORSO');
    expect(r.situazione_cambiata_il).toBeNull();
    expect(await storico()).toEqual([]);
  });
});

describe('annullaUltimoCambioSituazioneAction', () => {
  it('l’Admin torna all’atto precedente e la riga resta marcata annullata', async () => {
    await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'DECRETO_LIQUIDAZIONE');

    const esito = await annullaUltimoCambioSituazioneAction(SCHEMA, SCENARIO);

    expect(esito.success).toBe(true);
    expect(esito.situazione).toBe('PROPOSTA');
    expect(esito.storico?.[0]?.annullatoIl).not.toBeNull();
    const r = await riga();
    expect(r.tipo_istruttoria).toBe('PROPOSTA');
    expect(r.origine_proposta).toBe('Azienda');
    expect(r.stato).toBe('BOZZA');
    expect(r.situazione_cambiata_il).toBeNull();
    expect((await storico())[0].annullato_il).not.toBeNull();
    expect((await storico())[0].annullato_da).toBe('anna@alfa.it');
  });

  it('lo scenario bloccato si annulla solo con motivo, e lo sblocco resta tracciato', async () => {
    await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'CRAM_DOWN');
    await db.query(`UPDATE ${SCHEMA}.scenari SET bloccato_il = now() WHERE id = $1`, [SCENARIO]);

    const senzaMotivo = await annullaUltimoCambioSituazioneAction(SCHEMA, SCENARIO);
    expect(senzaMotivo.success).toBe(false);
    expect(senzaMotivo.error).toMatch(/sblocco esplicito/);
    expect((await riga()).tipo_istruttoria).toBe('CRAM_DOWN');

    const conMotivo = await annullaUltimoCambioSituazioneAction(
      SCHEMA,
      SCENARIO,
      '  Inquadramento errato  '
    );
    expect(conMotivo.success).toBe(true);
    const r = await riga();
    expect(r.tipo_istruttoria).toBe('PROPOSTA');
    expect(r.bloccato_il).toBeNull();
    const sblocco = await db.query(
      `SELECT motivo, sbloccato_da FROM ${SCHEMA}.scenario_sblocchi WHERE scenario_id = $1`,
      [SCENARIO]
    );
    expect(sblocco.rows[0]).toMatchObject({
      motivo: 'Inquadramento errato',
      sbloccato_da: 'anna@alfa.it',
    });
    const voce = (await storico())[0];
    expect(voce.annullato_da).toBe('anna@alfa.it');
  });

  it('senza cambi da annullare non inventa un ripristino', async () => {
    const esito = await annullaUltimoCambioSituazioneAction(SCHEMA, SCENARIO);

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/Nessun cambio/);
    expect((await riga()).tipo_istruttoria).toBe('PROPOSTA');
  });

  it('in demo il cambio non si annulla', async () => {
    await db.query(`UPDATE public.spazi SET demo = TRUE WHERE nome_schema = $1`, [SCHEMA]);

    const esito = await annullaUltimoCambioSituazioneAction(SCHEMA, SCENARIO);

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/demo/);
  });

  it('la guardia nega l’annullamento a chi non è Admin di Spazio', async () => {
    await aggiornaSituazioneScenarioAction(SCHEMA, SCENARIO, 'CRAM_DOWN');
    richiediAccessoScenario.mockRejectedValueOnce(
      new Error('Solo l’Admin di Spazio può annullare un cambio.')
    );

    const esito = await annullaUltimoCambioSituazioneAction(SCHEMA, SCENARIO);

    expect(esito.success).toBe(false);
    expect((await riga()).tipo_istruttoria).toBe('CRAM_DOWN');
    expect((await storico())[0].annullato_il).toBeNull();
  });
});
