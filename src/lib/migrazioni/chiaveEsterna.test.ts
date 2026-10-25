import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { sqlChiaveEsternaIdempotente } from './chiaveEsterna';

// La chiave esterna si prova su un Postgres vero (PGlite), non sulla stringa
// SQL: quello che conta è che dopo il blocco si possa cancellare la riga
// riferita senza perdere il diario, e che eseguirlo due volte non fallisca.
const db = await PGlite.create();

await db.exec(`
  CREATE SCHEMA tenant_prova;
  CREATE TABLE tenant_prova.aziende (id SERIAL PRIMARY KEY, ragione_sociale TEXT);
  CREATE TABLE tenant_prova.consegne (
    id SERIAL PRIMARY KEY,
    azienda_id INTEGER NOT NULL REFERENCES tenant_prova.aziende(id) ON DELETE CASCADE,
    reparto TEXT,
    ragione_sociale TEXT
  );
  INSERT INTO tenant_prova.aziende (id, ragione_sociale) VALUES (1, 'Alfa Srl');
  INSERT INTO tenant_prova.consegne (azienda_id, reparto, ragione_sociale)
  VALUES (1, 'Ufficio contributi', 'Alfa Srl');
`);

const SQL = sqlChiaveEsternaIdempotente({
  nomeSchema: 'tenant_prova',
  tabella: 'consegne',
  colonne: ['azienda_id'],
  schemaRiferito: 'tenant_prova',
  tabellaRiferita: 'aziende',
  colonneRiferite: ['id'],
  azione: 'SET NULL',
  nomeVincolo: 'consegne_azienda_fk',
});

describe('sqlChiaveEsternaIdempotente', () => {
  it('cambia l’azione a SET NULL e rende la colonna nullabile', async () => {
    await db.exec(SQL);
    await db.exec(SQL); // idempotente: la seconda esecuzione non fa nulla

    const vincoli = await db.query<{ conname: string; def: string }>(
      `SELECT c.conname, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
        WHERE c.conrelid = 'tenant_prova.consegne'::regclass AND c.contype = 'f'`
    );
    expect(vincoli.rows).toHaveLength(1);
    expect(vincoli.rows[0].conname).toBe('consegne_azienda_fk');
    expect(vincoli.rows[0].def).toContain('ON DELETE SET NULL');

    // La colonna non è più NOT NULL: una riga orfana (per un'anagrafica
    // cancellata altrove) non deve essere rifiutata.
    await db.exec(
      `INSERT INTO tenant_prova.consegne (azienda_id, reparto, ragione_sociale)
       VALUES (NULL, 'Ufficio riscossione', 'Beta Srl')`
    );
  });

  it('cancellare l’azienda non cancella il diario', async () => {
    await db.exec(`DELETE FROM tenant_prova.aziende WHERE id = 1`);

    const r = await db.query<{ azienda_id: number | null; ragione_sociale: string }>(
      `SELECT azienda_id, ragione_sociale FROM tenant_prova.consegne
        WHERE reparto = 'Ufficio contributi'`
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].azienda_id).toBeNull();
    expect(r.rows[0].ragione_sociale).toBe('Alfa Srl');
  });

  it('rifiuta identificatori che non sono nomi semplici', () => {
    expect(() =>
      sqlChiaveEsternaIdempotente({
        nomeSchema: 'tenant_prova; DROP TABLE x',
        tabella: 'consegne',
        colonne: ['azienda_id'],
        schemaRiferito: 'tenant_prova',
        tabellaRiferita: 'aziende',
        colonneRiferite: ['id'],
        azione: 'SET NULL',
        nomeVincolo: 'consegne_azienda_fk',
      })
    ).toThrow(/Identificatore non valido/);

    // Due colonne da una parte e una dall'altra non sono la stessa chiave.
    expect(() =>
      sqlChiaveEsternaIdempotente({
        nomeSchema: 'tenant_prova',
        tabella: 'consegne',
        colonne: ['azienda_id', 'reparto'],
        schemaRiferito: 'tenant_prova',
        tabellaRiferita: 'aziende',
        colonneRiferite: ['id'],
        azione: 'CASCADE',
        nomeVincolo: 'consegne_azienda_fk',
      })
    ).toThrow(/stesso numero di colonne/);
  });
});
