import { describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { componiCatenaDirettrici } from '@/lib/titoliEnte/direttrici';

// IL RIALLINEAMENTO, PROVATO SUL DATABASE.
//
// I test puri dicono quali righe il piano sceglie; qui si esegue il comando
// vero su un Postgres (PGlite) e si guarda nelle tabelle. Serve perché le cose
// che possono rompersi sono proprio quelle che una funzione pura non tocca: il
// confronto `= ANY($1::int[])`, il valore scritto nella colonna e soprattutto
// la transazione — se la seconda scrittura fallisce, la prima non deve restare.
//
// Dalla 0.159.0 l'ufficio vive sull'associazione della materia (`materia_tl`)
// e sui titoli: la TL è un catalogo piatto e non porta più la dipendenza.
//
// Ogni test ha il suo schema: così quello che un test scrive non decide cosa
// deve vedere il successivo. La guardia di accesso e il DDL sono simulati (il
// vero `provision` parla col database configurato); tutto il resto è il codice
// di produzione.

const db = await PGlite.create();

/** Il pool finto: `query` diretta e `connect()` per la transazione. */
vi.mock('@/lib/db', () => ({
  pool: {
    query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri),
    connect: async () => ({
      query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri),
      release: () => {},
    }),
  },
}));

const richiediAccessoSchema = vi.fn(async () => ({
  modalita: 'ADMIN_SPAZIO' as const,
  email: 'anna@alfa.it',
  spazioId: 1,
}));
vi.mock('@/lib/autorizzazione', () => ({ richiediAccessoSchema }));

// Le tabelle le crea questo test: qui ciò che conta è che esistano con le
// colonne che le query nominano.
vi.mock('@/db/provision', () => ({
  assicuraTabelleTl: async () => {},
  assicuraTabelleParametriSpazio: async () => {},
}));

const { riallineaUfficioAllaDirettriceAction } = await import('./materieLavorazione');

const DIRETTRICI = [
  { nome: 'Gestione del credito', prodotti: ['Diffide'] },
  { nome: 'Presidio dei flussi informativi', prodotti: ['DURC'] },
];

await db.exec(`
  CREATE TABLE public.spazi (
    id SERIAL PRIMARY KEY,
    nome_schema TEXT UNIQUE NOT NULL,
    direttrici_ente_strutturate JSONB
  );
`);

let contatore = 0;

/**
 * Uno spazio nuovo, con la stessa configurazione di partenza: due associazioni
 * che nominano l'ufficio fuori elenco con grafie diverse, una già su una
 * direttrice, una senza ufficio; e tre codici, di cui uno solo lo dichiara.
 *
 * Con `titoliBloccati` la tabella dei titoli rifiuta il valore di destinazione:
 * è il modo di far fallire la seconda scrittura della transazione con un errore
 * vero del database, non con un finto pool che finge.
 */
async function nuovoSpazio(opzioni: { titoliBloccati?: boolean } = {}): Promise<string> {
  contatore += 1;
  const schema = `tenant_prova_${contatore}`;
  const vincolo = opzioni.titoliBloccati
    ? ", CONSTRAINT titoli_bloccati CHECK (dipendenza <> 'Gestione del credito')"
    : '';
  await db.exec(`
    CREATE SCHEMA ${schema};

    CREATE TABLE ${schema}.tl (
      id SERIAL PRIMARY KEY,
      codice TEXT NOT NULL DEFAULT '',
      descrizione TEXT NOT NULL DEFAULT '',
      check_list BOOLEAN NOT NULL DEFAULT false,
      verso_check_list TEXT,
      ordine INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE ${schema}.materia_tl (
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

    CREATE TABLE ${schema}.titoli_ente (
      id SERIAL PRIMARY KEY,
      codice TEXT UNIQUE NOT NULL,
      atto TEXT NOT NULL,
      dipendenza TEXT,
      aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
      ${vincolo}
    );

    INSERT INTO public.spazi (nome_schema, direttrici_ente_strutturate)
    VALUES ('${schema}', '${JSON.stringify(DIRETTRICI)}'::jsonb);

    INSERT INTO ${schema}.tl (codice, descrizione) VALUES
      ('1', 'Emissione diffida'),
      ('2', 'Verifica del flusso'),
      ('3', 'Contabilizzazione'),
      ('4', 'Recupero coattivo');

    INSERT INTO ${schema}.materia_tl
      (materia_id, tl_id, direttrice, prodotto, dipendenza)
    VALUES
      (10, 1, 'Gestione del credito', 'Diffide', 'Ufficio Legale'),
      (11, 2, 'Gestione del credito', 'Diffide', 'ufficio legale'),
      (12, 3, 'Gestione del credito', 'Diffide', 'Gestione del credito'),
      (13, 4, 'Gestione del credito', 'Diffide', NULL);

    INSERT INTO ${schema}.titoli_ente (codice, atto, dipendenza) VALUES
      ('27', 'Flusso Uniemens', NULL),
      ('74', 'Recupero ANF', 'UFFICIO LEGALE'),
      ('92', 'Nota di rettifica', 'Presidio dei flussi informativi');
  `);
  return schema;
}

interface Riga {
  id: number;
  dipendenza: string | null;
}

/** Le dipendenze di una tabella, per id: quello che è finito davvero a database. */
async function dipendenze(
  tabella: 'materia_tl' | 'titoli_ente',
  schema: string
): Promise<(string | null)[]> {
  const r = await db.query<Riga>(`SELECT id, dipendenza FROM ${schema}.${tabella} ORDER BY id`);
  return r.rows.map((x) => x.dipendenza);
}

describe('riallineare un ufficio fuori elenco a una direttrice', () => {
  it('sposta le associazioni e i titoli che nominano l’ufficio, in qualunque grafia', async () => {
    const schema = await nuovoSpazio();
    richiediAccessoSchema.mockClear();

    const esito = await riallineaUfficioAllaDirettriceAction(
      schema,
      'Ufficio legale',
      'gestione del credito'
    );

    expect(esito).toEqual({
      success: true,
      destinazione: 'Gestione del credito',
      lavorazioni: 2,
      codici: 1,
    });

    // La riga 3 era già della direttrice, la 4 non ha ufficio: non si toccano.
    expect(await dipendenze('materia_tl', schema)).toEqual([
      'Gestione del credito',
      'Gestione del credito',
      'Gestione del credito',
      null,
    ]);
    // Il codice 27 non dichiara un ufficio, il 92 è di un'altra direttrice.
    expect(await dipendenze('titoli_ente', schema)).toEqual([
      null,
      'Gestione del credito',
      'Presidio dei flussi informativi',
    ]);

    // La guardia è quella delle azioni dei Parametri: solo l'Admin di spazio.
    expect(richiediAccessoSchema).toHaveBeenCalledWith(schema, { soloAdmin: true });
  });

  it('dopo il riallineamento l’ufficio non è più fuori elenco', async () => {
    const schema = await nuovoSpazio();
    await riallineaUfficioAllaDirettriceAction(schema, 'Ufficio legale', 'Gestione del credito');

    // Lo stesso calcolo che fa la pagina delle direttrici, sulle righe vere.
    const lavorazioni = await db.query<{
      id: number;
      materia_id: number;
      dipendenza: string | null;
    }>(`SELECT id, materia_id, dipendenza FROM ${schema}.materia_tl ORDER BY id`);
    const titoli = await db.query<Riga>(
      `SELECT id, dipendenza FROM ${schema}.titoli_ente ORDER BY id`
    );

    const catena = componiCatenaDirettrici({
      direttrici: DIRETTRICI,
      lavorazioni: lavorazioni.rows.map((r) => ({
        id: r.id,
        materiaId: r.materia_id,
        codice: String(r.id),
        tipologia: 'Lavorazione',
        direttrice: 'Gestione del credito',
        prodotto: 'Diffide',
        dipendenza: r.dipendenza,
        procedura: null,
        esito: null,
        ordine: 0,
      })),
      titoli: titoli.rows.map((r) => ({ id: r.id, dipendenza: r.dipendenza, materiaId: null })),
    });

    expect(catena.fuoriElenco).toEqual([]);
    // Le tre associazioni dell'ufficio ora sono della direttrice, e il codice 74
    // — l'unico che dichiarava un ufficio proprio — la segue.
    expect(catena.voci.find((v) => v.nome === 'Gestione del credito')).toMatchObject({
      lavorazioni: 3,
      materie: 3,
      codici: 1,
    });
  });

  it('non tocca niente quando la destinazione non è una direttrice', async () => {
    const schema = await nuovoSpazio();

    const esito = await riallineaUfficioAllaDirettriceAction(
      schema,
      'Ufficio legale',
      'Ufficio contenzioso'
    );

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/una delle direttrici configurate/);
    expect(await dipendenze('materia_tl', schema)).toEqual([
      'Ufficio Legale',
      'ufficio legale',
      'Gestione del credito',
      null,
    ]);
  });

  // Il punto della transazione: la prima scrittura è già passata quando la
  // seconda viene rifiutata dal database. Se il rollback non ci fosse, le
  // associazioni sarebbero sulla direttrice e i titoli ancora sul vecchio nome —
  // l'ufficio diviso in due, che è il guasto da evitare.
  it('se la scrittura dei titoli fallisce, anche le associazioni restano com’erano', async () => {
    const schema = await nuovoSpazio({ titoliBloccati: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const esito = await riallineaUfficioAllaDirettriceAction(
      schema,
      'Ufficio legale',
      'Gestione del credito'
    );

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/Riallineamento non riuscito/);
    // È fallita la SECONDA scrittura, non qualcosa prima: senza questo il test
    // passerebbe anche se il comando si fermasse prima di toccare il database.
    expect(esito.error).toMatch(/titoli_bloccati/);

    expect(await dipendenze('materia_tl', schema)).toEqual([
      'Ufficio Legale',
      'ufficio legale',
      'Gestione del credito',
      null,
    ]);
    expect(await dipendenze('titoli_ente', schema)).toEqual([
      null,
      'UFFICIO LEGALE',
      'Presidio dei flussi informativi',
    ]);
  });
});
