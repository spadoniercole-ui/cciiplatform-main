import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  assicuraTabellaDecisioni,
  leggiDecisioniPratica,
  registraDecisionePratica,
} from './registroDecisioni';

// LA TRACCIA SUL DATABASE VERO (Postgres in memoria).
//
// La prova copre ciò che una funzione pura non vede: che la tabella si crei,
// che l'insert arrivi, che l'autore resti leggibile anche dopo la
// disattivazione dell'utente e che il registro non si possa correggere. È il
// percorso che prima si verificava soltanto aprendo la pagina e cliccando.

const db = await PGlite.create();
const SCHEMA = 'tenant_prova_decisioni';

const esecutore = db as unknown as {
  query: (sql: string, valori?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

beforeEach(async () => {
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.admin_workspace (
      id SERIAL PRIMARY KEY,
      username TEXT,
      email TEXT
    );
    CREATE TABLE ${SCHEMA}.utenti_spazio (
      id SERIAL PRIMARY KEY,
      username TEXT,
      email TEXT,
      attivo BOOLEAN DEFAULT TRUE
    );
    INSERT INTO ${SCHEMA}.admin_workspace (id, username, email)
      VALUES (7, 'anna.verdi', 'anna@ente.esempio.it');
    INSERT INTO ${SCHEMA}.utenti_spazio (id, username, email, attivo) VALUES
      (9, 'marco.rossi', 'marco@ente.esempio.it', TRUE),
      (10, 'sara.bianchi', 'sara@ente.esempio.it', FALSE);
  `);
  await assicuraTabellaDecisioni(SCHEMA, esecutore);
});

const bozza = (patch: Record<string, unknown> = {}) => ({
  esito: 'PROSEGUI' as const,
  motivazione: 'Il credito quadra e la documentazione è completa.',
  autore: 'anna.verdi',
  autoreId: 7,
  autoreModalita: 'ADMIN_SPAZIO' as const,
  credito: 152_000,
  copertura: '4/4',
  ...patch,
});

describe('registro delle decisioni sul database', () => {
  it('scrive e rilegge una decisione con il suo contesto', async () => {
    const esito = await registraDecisionePratica(SCHEMA, 501, bozza(), esecutore);
    expect(esito.success).toBe(true);
    expect(esito.decisione?.credito).toBe(152_000);
    expect(esito.decisione?.copertura).toBe('4/4');
    expect(esito.decisione?.autoreAttivo).toBe(true);

    const lette = await leggiDecisioniPratica(SCHEMA, 501, esecutore);
    expect(lette).toHaveLength(1);
    expect(lette[0].autore).toBe('anna.verdi');
    expect(lette[0].autoreId).toBe(7);
    expect(lette[0].autoreModalita).toBe('ADMIN_SPAZIO');
    expect(lette[0].autoreAttivo).toBe(true);
  });

  it('due utenti omonimi restano distinguibili, e il disattivato si vede', async () => {
    await registraDecisionePratica(SCHEMA, 501, bozza(), esecutore);
    await registraDecisionePratica(
      SCHEMA,
      501,
      bozza({ autore: 'anna.verdi', autoreId: 9, autoreModalita: 'OPERATORE' }),
      esecutore
    );
    await registraDecisionePratica(
      SCHEMA,
      501,
      bozza({ autore: 'sara.bianchi', autoreId: 10, autoreModalita: 'OPERATORE' }),
      esecutore
    );

    const lette = await leggiDecisioniPratica(SCHEMA, 501, esecutore);
    expect(lette).toHaveLength(3);
    expect(lette.map((d) => Number(d.autoreId)).sort((a, b) => a - b)).toEqual([7, 9, 10]);

    // La riga di sara esiste ancora ma è disattivata: non sparisce, si dichiara.
    const sara = lette.find((d) => d.autoreId === 10);
    expect(sara?.autoreAttivo).toBe(false);
  });

  it('le decisioni di un’azienda non finiscono in quelle di un’altra', async () => {
    await registraDecisionePratica(SCHEMA, 501, bozza(), esecutore);
    await registraDecisionePratica(SCHEMA, 502, bozza({ autore: 'marco.rossi' }), esecutore);
    expect(await leggiDecisioniPratica(SCHEMA, 501, esecutore)).toHaveLength(1);
    expect(await leggiDecisioniPratica(SCHEMA, 502, esecutore)).toHaveLength(1);
  });

  it('una decisione senza motivo non entra nella traccia', async () => {
    const esito = await registraDecisionePratica(
      SCHEMA,
      501,
      bozza({ motivazione: 'ok' }),
      esecutore
    );
    expect(esito.success).toBe(false);
    expect(await leggiDecisioniPratica(SCHEMA, 501, esecutore)).toHaveLength(0);
  });

  it('la riga scritta non si può correggere né cancellare', async () => {
    await registraDecisionePratica(SCHEMA, 501, bozza(), esecutore);

    await expect(
      db.query(
        `UPDATE ${SCHEMA}.pratica_decisioni SET motivazione = 'corretta a mano' WHERE azienda_id = 501`
      )
    ).rejects.toThrow(/non si modifica/);
    await expect(
      db.query(`DELETE FROM ${SCHEMA}.pratica_decisioni WHERE azienda_id = 501`)
    ).rejects.toThrow(/non si modifica/);

    // La riga è ancora quella di prima: il tentativo non ha lasciato traccia
    // di sé, se non nel log del database.
    const lette = await leggiDecisioniPratica(SCHEMA, 501, esecutore);
    expect(lette).toHaveLength(1);
    expect(lette[0].motivazione).toBe('Il credito quadra e la documentazione è completa.');
  });
});

describe('lo stato della posizione annotato con la decisione', () => {
  it('scrive e rilegge grado e numero di blocchi', async () => {
    await registraDecisionePratica(
      SCHEMA,
      501,
      bozza({ statoGrado: 'QUASI', statoBlocchi: 1 }),
      esecutore
    );
    const [letta] = await leggiDecisioniPratica(SCHEMA, 501, esecutore);
    expect(letta.statoGrado).toBe('QUASI');
    expect(letta.statoBlocchi).toBe(1);
  });

  it('lascia null lo stato per le decisioni registrate prima', async () => {
    await registraDecisionePratica(SCHEMA, 501, bozza(), esecutore);
    const [letta] = await leggiDecisioniPratica(SCHEMA, 501, esecutore);
    expect(letta.statoGrado).toBeNull();
    expect(letta.statoBlocchi).toBeNull();
  });
});
