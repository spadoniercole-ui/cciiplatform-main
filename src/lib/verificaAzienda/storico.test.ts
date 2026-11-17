import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { leggiRigheStorico, type EsecutoreStorico } from './storico';

// IL RIPIEGO DELLO STORICO, SUL DATABASE VERO (0.244.1).
//
// Le colonne dell'autore arrivano con `assicuraTabellaAziende`, ma la lettura
// dello storico non la invoca. Su uno spazio vecchio la query con
// `verifica_eseguita_da_modalita` fallisce: prima lo storico tornava vuoto e la
// posizione sembrava mai verificata. Qui si prova che le righe restano.

const db = await PGlite.create();
const esecutore = db as unknown as EsecutoreStorico;

beforeEach(async () => {
  await db.exec(`
    DROP SCHEMA IF EXISTS tenant_storico_moderno CASCADE;
    DROP SCHEMA IF EXISTS tenant_storico_vecchio CASCADE;
    CREATE SCHEMA tenant_storico_moderno;
    CREATE SCHEMA tenant_storico_vecchio;

    CREATE TABLE tenant_storico_moderno.aziende (
      id SERIAL PRIMARY KEY,
      ragione_sociale TEXT NOT NULL,
      partita_iva TEXT,
      verifica_esito TEXT,
      verifica_eseguita_il TIMESTAMP,
      verifica_eseguita_da TEXT,
      verifica_eseguita_da_modalita TEXT,
      in_verifica BOOLEAN NOT NULL DEFAULT FALSE,
      verifica_archiviata BOOLEAN NOT NULL DEFAULT FALSE,
      verifica_motivo TEXT
    );
    INSERT INTO tenant_storico_moderno.aziende
      (id, ragione_sociale, verifica_esito, verifica_eseguita_il,
       verifica_eseguita_da, verifica_eseguita_da_modalita)
    VALUES (1, 'Tessitura Moderna S.p.A.', 'PROCEDIBILE', '2026-11-16 09:00:00',
            'anna.verdi', 'ADMIN_SPAZIO');

    -- Lo spazio creato prima della 0.244.0: nessuna colonna dell'autore.
    CREATE TABLE tenant_storico_vecchio.aziende (
      id SERIAL PRIMARY KEY,
      ragione_sociale TEXT NOT NULL,
      partita_iva TEXT,
      verifica_esito TEXT,
      verifica_eseguita_il TIMESTAMP,
      in_verifica BOOLEAN NOT NULL DEFAULT FALSE,
      verifica_archiviata BOOLEAN NOT NULL DEFAULT FALSE,
      verifica_motivo TEXT
    );
    INSERT INTO tenant_storico_vecchio.aziende
      (id, ragione_sociale, verifica_esito, verifica_eseguita_il)
    VALUES (2, 'Tessitura Vecchia S.r.l.', 'NON_PROCEDIBILE', '2026-11-15 09:00:00');
  `);
});

describe('lo storico delle verifiche', () => {
  it('legge autore e modalità quando le colonne ci sono', async () => {
    const righe = await leggiRigheStorico('tenant_storico_moderno', esecutore);
    expect(righe).toHaveLength(1);
    expect(righe[0].verifica_eseguita_da).toBe('anna.verdi');
    expect(righe[0].verifica_eseguita_da_modalita).toBe('ADMIN_SPAZIO');
  });

  it('senza le colonne dell’autore non svuota lo storico: rilegge senza', async () => {
    const righe = await leggiRigheStorico('tenant_storico_vecchio', esecutore);
    expect(righe).toHaveLength(1);
    expect(righe[0].id).toBe(2);
    expect(righe[0].ragione_sociale).toBe('Tessitura Vecchia S.r.l.');
    expect(righe[0].verifica_eseguita_da).toBeUndefined();
    expect(righe[0].verifica_eseguita_da_modalita).toBeUndefined();
  });

  it('restituisce vuoto solo quando non si può leggere nulla', async () => {
    expect(await leggiRigheStorico('tenant_che_non_esiste', esecutore)).toEqual([]);
  });
});
