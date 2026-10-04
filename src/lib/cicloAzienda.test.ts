import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { apriNuovoCiclo, elencaCicli, type Esecutore } from './cicloAzienda';

function esecutore(db: PGlite): Esecutore {
  return async (sql, params) => {
    const r =
      params && params.length ? await db.query(sql, params as never[]) : await db.query(sql);
    return (r.rows ?? []) as Record<string, unknown>[];
  };
}

const DDL = `
  CREATE SCHEMA tenant_x;
  CREATE TABLE tenant_x.aziende (id SERIAL PRIMARY KEY, ragione_sociale TEXT, codice_fiscale TEXT,
    contributi_scaduti NUMERIC, con_lavoratori_subordinati BOOLEAN, soglie_aggiornate_al DATE);
  CREATE TABLE tenant_x.azienda_screening (azienda_id INTEGER PRIMARY KEY, sezioni JSONB NOT NULL,
    relazione_testo TEXT, generato_il TIMESTAMP NOT NULL DEFAULT now());
  CREATE TABLE tenant_x.azienda_screening_risposte (azienda_id INTEGER, domanda_id TEXT, risposta TEXT);
  CREATE TABLE tenant_x.debiti_vera (id SERIAL PRIMARY KEY, azienda_id INTEGER, voce TEXT, importo NUMERIC);
`;

describe('nuovo ciclo di istruttoria sulla stessa azienda', () => {
  it('archivia screening, check list, V.E.R.A. e soglie, poi li azzera', async () => {
    const db = await PGlite.create();
    await db.exec(DDL);
    await db.exec(`
      INSERT INTO tenant_x.aziende (ragione_sociale, codice_fiscale, contributi_scaduti, con_lavoratori_subordinati)
        VALUES ('ARETUSEA', '999', 41993, TRUE), ('ALTRA', '888', 10, FALSE);
      INSERT INTO tenant_x.azienda_screening (azienda_id, sezioni, relazione_testo) VALUES (1, '[]', 'Relazione vecchia');
      INSERT INTO tenant_x.azienda_screening_risposte VALUES (1, 'q1', 'si'), (1, 'q2', 'no');
      INSERT INTO tenant_x.debiti_vera (azienda_id, voce, importo) VALUES (1, 'DM10', 100), (2, 'DM10', 5);
    `);
    const e = esecutore(db);
    const esito = await apriNuovoCiclo(e, 'tenant_x', 1);
    expect(esito.archiviato).toBe(true);
    expect(esito.righe.azienda_screening_risposte).toBe(2);

    // Azzerato per l'azienda 1, intatto per l'azienda 2.
    expect((await e(`SELECT * FROM tenant_x.azienda_screening`)).length).toBe(0);
    expect((await e(`SELECT * FROM tenant_x.debiti_vera`)).map((r) => r.azienda_id)).toEqual([2]);
    const a1 = (await e(`SELECT * FROM tenant_x.aziende WHERE id = 1`))[0];
    expect(a1.contributi_scaduti).toBeNull();
    expect(a1.ragione_sociale).toBe('ARETUSEA');
    const a2 = (await e(`SELECT * FROM tenant_x.aziende WHERE id = 2`))[0];
    expect(Number(a2.contributi_scaduti)).toBe(10);

    const cicli = await elencaCicli(e, 'tenant_x', 1);
    expect(cicli).toHaveLength(1);
    expect(cicli[0].relazioneScreening).toBe('Relazione vecchia');
    expect(cicli[0].partiteVera).toBe(1);
    expect(cicli[0].risposteChecklist).toBe(2);
  });

  it('senza lavoro precedente non apre alcun ciclo', async () => {
    const db = await PGlite.create();
    await db.exec(DDL);
    await db.exec(`INSERT INTO tenant_x.aziende (ragione_sociale) VALUES ('NUOVA')`);
    const e = esecutore(db);
    expect((await apriNuovoCiclo(e, 'tenant_x', 1)).archiviato).toBe(false);
    expect(await elencaCicli(e, 'tenant_x', 1)).toEqual([]);
  });
});
