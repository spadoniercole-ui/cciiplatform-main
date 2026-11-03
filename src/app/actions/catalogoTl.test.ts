import { describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// UNA TS, PIÙ PRODOTTI — provato sul database.
//
// I test puri dicono come si normalizza e si valida l'elenco; qui si guarda che
// cosa resta scritto davvero: il jsonb, la coppia singola che il processo
// operativo legge, e il fatto che la seconda associazione non faccia nascere
// una seconda TS. È la parte che una funzione pura non tocca.
//
// La guardia di accesso e il DDL sono simulati (il vero `provision` parla col
// database configurato); tutto il resto è il codice di produzione.

const db = await PGlite.create();

// PGlite non riporta `rowCount` come `pg`: le azioni lo leggono per capire se
// l'UPDATE ha trovato la riga, quindi qui si ricava dalle righe tornate (le
// scritture che contano hanno `RETURNING`).
const query = async (testo: string, parametri?: unknown[]) => {
  const r = await db.query(testo, parametri as never);
  return { ...r, rowCount: r.rows.length };
};

vi.mock('@/lib/db', () => ({
  pool: {
    query,
    connect: async () => ({ query, release: () => {} }),
  },
}));

vi.mock('@/lib/autorizzazione', () => ({
  richiediAccessoSchema: vi.fn(async () => ({
    modalita: 'ADMIN_SPAZIO' as const,
    email: 'anna@alfa.it',
    spazioId: 1,
  })),
}));

vi.mock('@/db/provision', () => ({
  assicuraTabelleTl: async () => {},
  assicuraTabelleParametriSpazio: async () => {},
}));

const { ottieniCatalogoTl, salvaTlAction } = await import('./materieLavorazione');

const SCHEMA = 'tenant_catalogo';

await db.exec(`
  CREATE SCHEMA ${SCHEMA};

  CREATE TABLE ${SCHEMA}.tl (
    id SERIAL PRIMARY KEY,
    codice TEXT NOT NULL DEFAULT '',
    descrizione TEXT NOT NULL DEFAULT '',
    check_list BOOLEAN NOT NULL DEFAULT false,
    verso_check_list TEXT,
    ordine INTEGER NOT NULL DEFAULT 0,
    direttrice TEXT,
    prodotto TEXT,
    prodotti JSONB NOT NULL DEFAULT '[]'::jsonb,
    aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_tl_codice ON ${SCHEMA}.tl (lower(btrim(codice)));
  CREATE UNIQUE INDEX idx_tl_codice_senza_prodotto
    ON ${SCHEMA}.tl (lower(btrim(codice)))
    WHERE jsonb_array_length(prodotti) = 0;

  CREATE TABLE ${SCHEMA}.materia_tl (
    id SERIAL,
    materia_id INTEGER NOT NULL,
    tl_id INTEGER NOT NULL,
    ordine INTEGER NOT NULL DEFAULT 0,
    direttrice TEXT NOT NULL DEFAULT '',
    prodotto TEXT NOT NULL DEFAULT '',
    dipendenza TEXT,
    procedura TEXT,
    esito TEXT,
    PRIMARY KEY (materia_id, tl_id)
  );

  CREATE TABLE ${SCHEMA}.categoria_tl (
    categoria TEXT NOT NULL,
    tl_id INTEGER NOT NULL,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    ordine INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (categoria, tl_id)
  );
`);

type Riga = { direttrice: string | null; prodotto: string | null; prodotti: unknown };

async function riga(id: number): Promise<Riga> {
  const r = await db.query<Riga>(
    `SELECT direttrice, prodotto, prodotti FROM ${SCHEMA}.tl WHERE id = $1`,
    [id]
  );
  return r.rows[0];
}

describe('salvaTlAction con più prodotti', () => {
  it('salva la prima associazione e la scrive anche come coppia singola', async () => {
    const esito = await salvaTlAction(SCHEMA, {
      codice: '81',
      descrizione: 'Diffida M400',
      prodotti: [{ direttrice: 'Vigilanza documentale', prodotto: 'Diffida M400' }],
    });
    expect(esito.success).toBe(true);

    const scritta = await riga(esito.id!);
    expect(scritta.prodotti).toEqual([
      { direttrice: 'Vigilanza documentale', prodotto: 'Diffida M400' },
    ]);
    // La coppia singola resta scritta: la legge il processo operativo.
    expect(scritta.direttrice).toBe('Vigilanza documentale');
    expect(scritta.prodotto).toBe('Diffida M400');
  });

  it('aggiunge il secondo prodotto alla stessa TS, senza crearne un’altra', async () => {
    const catalogo = await ottieniCatalogoTl(SCHEMA);
    expect(catalogo.success).toBe(true);
    const esistente = catalogo.tl.find((t) => t.codice === '81');
    expect(esistente).toBeDefined();

    const esito = await salvaTlAction(SCHEMA, {
      id: esistente!.id,
      codice: '81',
      descrizione: 'Diffida M400',
      prodotti: [
        { direttrice: 'Vigilanza documentale', prodotto: 'Diffida M400' },
        { direttrice: 'Vigilanza documentale', prodotto: 'Diffida sgravi' },
      ],
    });
    expect(esito.success).toBe(true);

    const dopo = await ottieniCatalogoTl(SCHEMA);
    const ts = dopo.tl.filter((t) => t.codice === '81');
    expect(ts).toHaveLength(1);
    expect(ts[0].prodotti).toEqual([
      { direttrice: 'Vigilanza documentale', prodotto: 'Diffida M400' },
      { direttrice: 'Vigilanza documentale', prodotto: 'Diffida sgravi' },
    ]);
  });

  it('togliere un prodotto lascia la TS e non porta via gli altri', async () => {
    const catalogo = await ottieniCatalogoTl(SCHEMA);
    const ts = catalogo.tl.find((t) => t.codice === '81')!;

    const esito = await salvaTlAction(SCHEMA, {
      id: ts.id,
      codice: '81',
      descrizione: 'Diffida M400',
      prodotti: [{ direttrice: 'Vigilanza documentale', prodotto: 'Diffida sgravi' }],
    });
    expect(esito.success).toBe(true);

    const dopo = await riga(ts.id);
    expect(dopo.prodotti).toEqual([
      { direttrice: 'Vigilanza documentale', prodotto: 'Diffida sgravi' },
    ]);
    // La coppia singola segue il primo prodotto rimasto.
    expect(dopo.prodotto).toBe('Diffida sgravi');
  });

  it('lo stesso codice su un altro prodotto è un’altra TS, con la sua descrizione', async () => {
    const esito = await salvaTlAction(SCHEMA, {
      codice: ' 81 ',
      descrizione: 'Contabilizzazione diffida sgravi contributivi',
      prodotti: [{ direttrice: 'Vigilanza documentale', prodotto: 'Diffida contributi' }],
    });
    expect(esito.success).toBe(true);

    const catalogo = await ottieniCatalogoTl(SCHEMA);
    const ts81 = catalogo.tl.filter((t) => t.codice.trim() === '81');
    expect(ts81).toHaveLength(2);
    expect(ts81.map((t) => t.descrizione).sort()).toEqual([
      'Contabilizzazione diffida sgravi contributivi',
      'Diffida M400',
    ]);
  });

  it('lo stesso codice sullo stesso prodotto resta un doppione', async () => {
    const esito = await salvaTlAction(SCHEMA, {
      codice: '81',
      descrizione: 'Diffida M400',
      prodotti: [{ direttrice: 'Vigilanza documentale', prodotto: 'Diffida sgravi' }],
    });
    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/esiste già una TS con il codice «81»/i);
    expect(esito.error).toMatch(/Diffida sgravi/i);
  });

  it('senza prodotto il codice resta uno solo', async () => {
    const primo = await salvaTlAction(SCHEMA, { codice: 'ZZ', descrizione: 'Senza prodotto' });
    expect(primo.success).toBe(true);

    const secondo = await salvaTlAction(SCHEMA, { codice: ' zz ', descrizione: 'Doppione' });
    expect(secondo.success).toBe(false);
    expect(secondo.error).toMatch(/senza prodotto/i);
  });
});
