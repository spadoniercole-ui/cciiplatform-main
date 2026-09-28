import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { queryAggiornaLimite } from './sqlLimiti';

// Bug storico: la WHERE usava `$7` (ente25Novies) al posto di `$8` (id), così
// l'aggiornamento non toccava la riga voluta. Si verifica su un Postgres vero
// (PGlite) che la riga giusta, e solo quella, venga aggiornata.

async function databaseDiProva(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(`
    CREATE SCHEMA tenant_prova;
    CREATE TABLE tenant_prova.limiti_ricevibilita (
      id SERIAL PRIMARY KEY,
      categoria_creditore TEXT NOT NULL UNIQUE,
      percentuale_minima INTEGER NOT NULL DEFAULT 0,
      unica_soluzione_ammessa BOOLEAN NOT NULL DEFAULT TRUE,
      rateizzazione_ammessa BOOLEAN NOT NULL DEFAULT TRUE,
      note TEXT,
      valore_liquidazione_stimato NUMERIC,
      alias TEXT[] NOT NULL DEFAULT '{}',
      ente_25novies TEXT
    );
    INSERT INTO tenant_prova.limiti_ricevibilita (categoria_creditore, ente_25novies)
    VALUES ('INPS', 'INPS'), ('Erario', NULL), ('Fornitori', NULL);
  `);
  return db;
}

describe('queryAggiornaLimite', () => {
  it('il parametro della WHERE è l’id, non ente25Novies', () => {
    const { testo, parametri } = queryAggiornaLimite('tenant_prova', 2, {
      percentualeMinima: 40,
      unicaSoluzioneAmmessa: true,
      rateizzazioneAmmessa: false,
      note: null,
      ente25Novies: 'AGENZIA_ENTRATE',
    });
    const segnapostoWhere = Number(/WHERE id = \$(\d+)/.exec(testo)?.[1]);
    expect(parametri[segnapostoWhere - 1]).toBe(2);
    const segnapostoEnte = Number(/COALESCE\(\$(\d+), ente_25novies\)/.exec(testo)?.[1]);
    expect(parametri[segnapostoEnte - 1]).toBe('AGENZIA_ENTRATE');
    expect(parametri).toHaveLength(8);
  });

  it('aggiorna la riga indicata e solo quella', async () => {
    const db = await databaseDiProva();
    const { testo, parametri } = queryAggiornaLimite('tenant_prova', 2, {
      percentualeMinima: 40,
      unicaSoluzioneAmmessa: false,
      rateizzazioneAmmessa: true,
      note: 'nota',
      valoreLiquidazioneStimato: 1234.5,
      alias: ['Agenzia delle Entrate'],
      ente25Novies: 'AGENZIA_ENTRATE',
    });
    const esito = await db.query(testo, parametri);
    expect(esito.affectedRows).toBe(1);

    const righe = await db.query<{
      id: number;
      percentuale_minima: number;
      unica_soluzione_ammessa: boolean;
      note: string | null;
      valore_liquidazione_stimato: string | null;
      alias: string[];
      ente_25novies: string | null;
    }>(`SELECT * FROM tenant_prova.limiti_ricevibilita ORDER BY id`);
    const [inps, erario, fornitori] = righe.rows;
    expect(erario.percentuale_minima).toBe(40);
    expect(erario.unica_soluzione_ammessa).toBe(false);
    expect(erario.note).toBe('nota');
    expect(Number(erario.valore_liquidazione_stimato)).toBe(1234.5);
    expect(erario.alias).toEqual(['Agenzia delle Entrate']);
    expect(erario.ente_25novies).toBe('AGENZIA_ENTRATE');
    // Le altre righe restano intatte.
    expect(inps.percentuale_minima).toBe(0);
    expect(inps.ente_25novies).toBe('INPS');
    expect(fornitori.percentuale_minima).toBe(0);
    await db.close();
  });

  it('ente25Novies assente lascia invariato il valore esistente', async () => {
    const db = await databaseDiProva();
    const { testo, parametri } = queryAggiornaLimite('tenant_prova', 1, {
      percentualeMinima: 30,
      unicaSoluzioneAmmessa: true,
      rateizzazioneAmmessa: true,
      note: null,
    });
    const esito = await db.query(testo, parametri);
    expect(esito.affectedRows).toBe(1);
    const riga = await db.query<{ percentuale_minima: number; ente_25novies: string | null }>(
      `SELECT percentuale_minima, ente_25novies FROM tenant_prova.limiti_ricevibilita WHERE id = 1`
    );
    expect(riga.rows[0]).toEqual({ percentuale_minima: 30, ente_25novies: 'INPS' });
    await db.close();
  });

  it('rifiuta un nome schema non valido', () => {
    expect(() =>
      queryAggiornaLimite('x"; DROP', 1, {
        percentualeMinima: 0,
        unicaSoluzioneAmmessa: true,
        rateizzazioneAmmessa: true,
        note: null,
      })
    ).toThrow();
  });
});
