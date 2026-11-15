import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PERCORSO_DEMO } from './percorsoEnte';
import { assicuraScenariAggiuntivi, inserisciVerificheDemo } from './verificheDemo';
import { inserisciPropostaDemo, riallineaAttiDemo } from './caricaPercorsoEnte';

// IL SEED DELLE VERIFICHE, SUL DATABASE VERO (Postgres in memoria).
//
// Serve a coprire ciò che una prova pura non vede: che le due scritture
// girino, che la verifica amministrativa non si sovrascriva, che la simulazione
// aziendale resti una sola e che lo scenario aggiuntivo non si duplichi. Con
// l'impostazione attuale la natura sta sullo scenario e le verifiche
// sull'azienda: è esattamente quello che queste righe devono mostrare.

const db = await PGlite.create();
const SCHEMA = 'tenant_demo_verifiche';

beforeEach(async () => {
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.scenari (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT 'IN_CORSO',
      tipo_proposta TEXT NOT NULL DEFAULT 'RICEVUTA',
      origine_proposta TEXT NOT NULL DEFAULT 'Ente',
      tipo_istruttoria TEXT NOT NULL DEFAULT 'PROPOSTA',
      data_deposito_proposta DATE,
      simulazione_attiva BOOLEAN NOT NULL DEFAULT FALSE,
      verifica_amministrativa_il TIMESTAMP,
      verifica_contabile_il TIMESTAMP
    );
    CREATE TABLE ${SCHEMA}.proposta_creditori (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL,
      categoria_creditore TEXT NOT NULL,
      importo_dovuto NUMERIC NOT NULL DEFAULT 0,
      percentuale_offerta NUMERIC NOT NULL DEFAULT 0,
      modalita TEXT NOT NULL DEFAULT 'UNICA_SOLUZIONE',
      numero_rate INTEGER,
      note TEXT,
      rango_legale TEXT,
      rilevante_per_ente BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE ${SCHEMA}.verifica_azienda_simulazioni (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      profilo TEXT NOT NULL,
      annualita INTEGER NOT NULL,
      debito_ente NUMERIC(16,2) NOT NULL DEFAULT 0,
      crescita_storica_pct NUMERIC(8,2),
      crescita_applicata_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
      colonne JSONB NOT NULL,
      avvertenze JSONB NOT NULL DEFAULT '[]'::jsonb,
      base_per_proposta BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);
});

const meccanica = PERCORSO_DEMO.find((a) => a.tipoIstruttoria === 'PROPOSTA')!;
const senzaFacoltative = PERCORSO_DEMO.find((a) => a.verifiche?.aziendale === false)!;

async function scenario(id: number, aziendaId: number, nome: string, tipo: string) {
  await db.query(
    `INSERT INTO ${SCHEMA}.scenari (id, azienda_id, nome, tipo_istruttoria) VALUES ($1,$2,$3,$4)`,
    [id, aziendaId, nome, tipo]
  );
}

describe('seed delle verifiche demo', () => {
  it('scrive amministrativa e contabile e salva la verifica aziendale una volta sola', async () => {
    await scenario(1, 100, 'Proposta di concordato', 'PROPOSTA');

    await inserisciVerificheDemo(db, SCHEMA, 100, meccanica, 1, 'PROPOSTA');

    const riga = await db.query<{
      amm: string | null;
      cont: string | null;
    }>(
      `SELECT to_char(verifica_amministrativa_il, 'YYYY-MM-DD') AS amm,
              to_char(verifica_contabile_il, 'YYYY-MM-DD') AS cont
         FROM ${SCHEMA}.scenari WHERE id = 1`
    );
    expect(riga.rows[0]).toEqual({ amm: meccanica.dataVerifica, cont: meccanica.dataVerifica });

    const sim = await db.query<{ n: number; base: boolean; colonne: unknown[] }>(
      `SELECT COUNT(*)::int AS n, bool_or(base_per_proposta) AS base,
              (array_agg(colonne))[1] AS colonne
         FROM ${SCHEMA}.verifica_azienda_simulazioni WHERE azienda_id = 100`
    );
    expect(sim.rows[0].n).toBe(1);
    // L'accordo è la natura che si appoggia alla proiezione: la base è sua.
    expect(sim.rows[0].base).toBe(true);
    expect(Array.isArray(sim.rows[0].colonne)).toBe(true);
    expect((sim.rows[0].colonne as unknown[]).length).toBeGreaterThan(0);

    // Rilanciare il seed non duplica la simulazione né riscrive le date.
    await inserisciVerificheDemo(db, SCHEMA, 100, meccanica, 1, 'PROPOSTA');
    const dopo = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.verifica_azienda_simulazioni WHERE azienda_id = 100`
    );
    expect(dopo.rows[0].n).toBe(1);
  });

  it('sull’azienda senza facoltative lascia contabile vuota e nessuna simulazione', async () => {
    await scenario(2, 200, 'Valutazione aperta', 'DA_CHIEDERE');

    await inserisciVerificheDemo(db, SCHEMA, 200, senzaFacoltative, 2, 'DA_CHIEDERE');

    const riga = await db.query<{ amm: string | null; cont: string | null }>(
      `SELECT to_char(verifica_amministrativa_il, 'YYYY-MM-DD') AS amm,
              to_char(verifica_contabile_il, 'YYYY-MM-DD') AS cont
         FROM ${SCHEMA}.scenari WHERE id = 2`
    );
    // L'amministrativa c'è sempre; la contabile non è prevista per questa azienda.
    expect(riga.rows[0].amm).toBe(senzaFacoltative.dataVerifica);
    expect(riga.rows[0].cont).toBeNull();

    const sim = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.verifica_azienda_simulazioni WHERE azienda_id = 200`
    );
    expect(sim.rows[0].n).toBe(0);
  });

  it('crea il secondo scenario con la sua natura, senza duplicarlo', async () => {
    await scenario(3, 100, meccanica.scenario, 'PROPOSTA');

    const primo = await assicuraScenariAggiuntivi(db, SCHEMA, 100, meccanica);
    expect(primo).toHaveLength(1);
    expect(primo[0].tipo).toBe('CRAM_DOWN');

    const secondo = await assicuraScenariAggiuntivi(db, SCHEMA, 100, meccanica);
    expect(secondo[0].id).toBe(primo[0].id);

    const tutti = await db.query<{ nome: string; tipo: string }>(
      `SELECT nome, tipo_istruttoria AS tipo FROM ${SCHEMA}.scenari WHERE azienda_id = 100 ORDER BY id`
    );
    // Stessa azienda, due atti: è la differenziazione a livello di scenario.
    // L'ordine non conta (l'id esplicito del test non avanza la sequenza).
    expect(tutti.rows.map((r) => r.tipo).sort()).toEqual(['CRAM_DOWN', 'PROPOSTA']);
  });

  it('scrive le righe dell’accordo una volta sola, con una sola riga per l’ente', async () => {
    await inserisciPropostaDemo(db, SCHEMA, 3, meccanica);
    await inserisciPropostaDemo(db, SCHEMA, 3, meccanica);

    const righe = await db.query<{
      categoria_creditore: string;
      importo_dovuto: string;
      percentuale_offerta: string;
      rilevante_per_ente: boolean;
    }>(
      `SELECT categoria_creditore, importo_dovuto, percentuale_offerta, rilevante_per_ente
         FROM ${SCHEMA}.proposta_creditori WHERE scenario_id = 3 ORDER BY id`
    );
    // Il doppio giro non duplica: la proposta lavorata non si riscrive.
    expect(righe.rows).toHaveLength(3);
    const perEnte = righe.rows.filter((r) => r.rilevante_per_ente);
    expect(perEnte).toHaveLength(1);
    expect(perEnte[0].categoria_creditore).toBe('INPS');
    expect(perEnte[0].importo_dovuto).toBe('245000');
    expect(perEnte[0].percentuale_offerta).toBe('55');
  });

  it('toglie righe e istruttorie finite sull’atto sbagliato, senza toccare quelle giuste', async () => {
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.scenari (
         id SERIAL PRIMARY KEY,
         azienda_id INTEGER NOT NULL,
         nome TEXT NOT NULL,
         tipo_istruttoria TEXT NOT NULL
       )`
    );
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.istruttoria_giudice (
         scenario_id INTEGER PRIMARY KEY,
         documenti JSONB,
         lettura JSONB
       )`
    );
    await db.query(
      `INSERT INTO ${SCHEMA}.scenari (id, azienda_id, nome, tipo_istruttoria) VALUES
         (3, 100, 'Accordo', 'PROPOSTA'),
         (4, 100, 'Decreto', 'DECRETO_LIQUIDAZIONE')`
    );
    // L'accordo con i numeri del decreto addosso, e il decreto con le righe
    // della proposta: sono i due avanzi che la demo vera ha mostrato.
    await db.query(
      `INSERT INTO ${SCHEMA}.istruttoria_giudice (scenario_id, documenti, lettura)
       VALUES (3, '[{"url":"/demo/decreto-liquidazione-tessitura-lario.pdf"}]', '{}')`
    );
    await db.query(
      `INSERT INTO ${SCHEMA}.proposta_creditori
         (scenario_id, categoria_creditore, importo_dovuto, percentuale_offerta, rilevante_per_ente)
       VALUES (3, 'INPS', 92000, 40, TRUE), (4, 'INPS', 92000, 40, TRUE)`
    );

    await riallineaAttiDemo(db, SCHEMA, 100);

    const righe = await db.query<{ scenario_id: number }>(
      `SELECT scenario_id FROM ${SCHEMA}.proposta_creditori ORDER BY scenario_id`
    );
    const istruttorie = await db.query<{ scenario_id: number }>(
      `SELECT scenario_id FROM ${SCHEMA}.istruttoria_giudice ORDER BY scenario_id`
    );
    // Restano solo quelle dell'accordo, e l'istruttoria del decreto non c'era.
    expect(righe.rows.map((r) => Number(r.scenario_id))).toEqual([3]);
    expect(istruttorie.rows).toHaveLength(0);
  });
});
