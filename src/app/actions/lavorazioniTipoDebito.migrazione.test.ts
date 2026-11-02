import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// LA MIGRAZIONE DALLA TABELLA STORICA, PROVATA SU UNO SPAZIO VERO.
//
// Il caso che conta è lo spazio configurato prima della 0.138.x: le TL stanno
// in `lavorazioni_tipo_debito`, con i destinatari scritti a mano. Quando il
// triage si apre, quelle TL devono comparire nel catalogo — codice e
// descrizione — con i destinatari che avevano, e l'ufficio agganciato da solo
// quando il nome è una direttrice. Nessuna riga storica va persa, nessuna
// duplicata alla seconda apertura.
//
// Qui gira il codice di produzione (azioni e migrazione) su un Postgres vero
// (PGlite): le cose che possono rompersi sono proprio quelle che una funzione
// pura non tocca — l'indice univoco sulla coppia, le marcature, la transazione
// dell'eliminazione. La guardia di accesso e il DDL di `provision` sono
// simulati; il resto no.

const db = await PGlite.create();

/** Il pool finto: `query` diretta (con `rowCount`) e `connect()` per la transazione. */
const esegui = async (testo: string, parametri?: unknown[]) => {
  const r = await db.query(testo, parametri as never);
  return { rows: r.rows, rowCount: r.rows.length };
};

vi.mock('@/lib/db', () => ({
  pool: {
    query: (testo: string, parametri?: unknown[]) => esegui(testo, parametri),
    connect: async () => ({ query: esegui, release: () => {} }),
  },
}));

const richiediAccessoSchema = vi.fn(async () => ({
  modalita: 'ADMIN_SPAZIO' as const,
  email: 'anna@alfa.it',
  spazioId: 1,
}));
vi.mock('@/lib/autorizzazione', () => ({ richiediAccessoSchema }));

// Le tabelle le crea questo test (è uno spazio che esisteva già prima della
// migrazione); la migrazione vera e il catalogo sono quelli di produzione.
vi.mock('@/db/provision', () => ({ assicuraTabellaCategorieTipoDebito: async () => {} }));

const { ottieniLavorazioniTipoDebito, salvaLavorazioneTipoDebitoAction } =
  await import('./lavorazioniTipoDebito');
const {
  eliminaCategoriaTipoDebitoAction,
  aggiornaCategoriaTipoDebitoAction,
  ottieniCategorieTipoDebito,
} = await import('./categorieTipoDebito');

const SCHEMA = 'tenant_storico';
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

  CREATE SCHEMA ${SCHEMA};

  CREATE TABLE ${SCHEMA}.categorie_tipo_debito (
    codice TEXT PRIMARY KEY,
    etichetta TEXT NOT NULL,
    descrizione TEXT,
    ordine INTEGER NOT NULL DEFAULT 0,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    contribuisce BOOLEAN NOT NULL DEFAULT TRUE
  );

  CREATE TABLE ${SCHEMA}.lavorazioni_tipo_debito (
    id SERIAL PRIMARY KEY,
    categoria TEXT NOT NULL,
    lavorazione TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    ordine INTEGER NOT NULL DEFAULT 0
  );

  INSERT INTO public.spazi (nome_schema, direttrici_ente_strutturate)
  VALUES ('${SCHEMA}', '${JSON.stringify(DIRETTRICI)}'::jsonb);

  INSERT INTO ${SCHEMA}.categorie_tipo_debito (codice, etichetta, descrizione, ordine) VALUES
    ('DEBITO', 'Debito', 'Debito certo da contabilizzare', 1),
    ('AVA', 'AVA', 'Affidato all''Agente della Riscossione', 2),
    ('NEUTRO', 'Neutro', 'Voce neutra ai fini del confronto', 3);

  INSERT INTO ${SCHEMA}.lavorazioni_tipo_debito
    (categoria, lavorazione, destinatario, attivo, ordine) VALUES
    ('DEBITO', 'Contabilizzare il debito', 'gestione del credito', TRUE, 1),
    ('DEBITO', 'Emissione diffida', 'Ufficio Legale', TRUE, 2),
    ('AVA', 'Recupero coattivo', 'Presidio dei flussi informativi', TRUE, 3),
    ('NEUTRO', 'Verifica del flusso', '  Anna   Bianchi ', FALSE, 4),
    ('CANCELLATA', 'Lavorazione fantasma', 'Ufficio Legale', TRUE, 5);
`);

beforeEach(() => {
  richiediAccessoSchema.mockClear();
});

describe('la migrazione crea le TL nel catalogo', () => {
  it('copia codice, descrizione e destinatario di ogni riga storica', async () => {
    const esito = await ottieniLavorazioniTipoDebito(SCHEMA);

    expect(esito.success).toBe(true);
    expect(esito.lavorazioni).toEqual([
      {
        id: expect.any(Number),
        categoria: 'DEBITO',
        lavorazione: 'Contabilizzare il debito',
        // La grafia delle direttrici, non quella scritta per caso nella riga.
        destinatario: 'Gestione del credito',
        attivo: true,
        ordine: 1,
      },
      {
        id: expect.any(Number),
        categoria: 'DEBITO',
        lavorazione: 'Emissione diffida',
        // Non è una direttrice: resta scritto com'era, non si scarta.
        destinatario: 'Ufficio Legale',
        attivo: true,
        ordine: 2,
      },
      {
        id: expect.any(Number),
        categoria: 'AVA',
        lavorazione: 'Recupero coattivo',
        destinatario: 'Presidio dei flussi informativi',
        attivo: true,
        ordine: 3,
      },
      {
        id: expect.any(Number),
        categoria: 'NEUTRO',
        lavorazione: 'Verifica del flusso',
        // Spazi compattati, destinatario conservato, TL disattivata come era.
        destinatario: 'Anna Bianchi',
        attivo: false,
        ordine: 4,
      },
    ]);
    // La guardia di lettura è quella dello spazio: la migrazione non è una via
    // traversa per entrare in uno schema che non è il proprio.
    expect(richiediAccessoSchema).toHaveBeenCalledWith(SCHEMA);
  });

  it('lo stesso codice può stare su più TL, con descrizioni diverse', async () => {
    const esito = await ottieniLavorazioniTipoDebito(SCHEMA);
    expect(esito.lavorazioni.filter((l) => l.categoria === 'DEBITO')).toHaveLength(2);
    // Il codice da solo non è la chiave: l'indice univoco è sulla coppia.
    const vincolo = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'idx_catalogo_tl_unica'`,
      [SCHEMA]
    );
    expect(vincolo.rows[0]?.indexdef).toMatch(/\(codice, descrizione\)/);
  });

  it('la categoria cancellata non viene ricopiata, e la riga si dichiara scartata', async () => {
    const esito = await ottieniLavorazioniTipoDebito(SCHEMA);
    expect(esito.lavorazioni.some((l) => l.categoria === 'CANCELLATA')).toBe(false);
    // Anche la riga scartata è marcata: alla riapertura non si rilegge.
    const storiche = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${SCHEMA}.lavorazioni_tipo_debito WHERE migrata_il IS NULL`
    );
    expect(storiche.rows[0].n).toBe(0);
  });

  it('alla seconda apertura non duplica nulla', async () => {
    await ottieniLavorazioniTipoDebito(SCHEMA);
    const seconda = await ottieniLavorazioniTipoDebito(SCHEMA);

    expect(seconda.lavorazioni).toHaveLength(4);
    const catalogo = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${SCHEMA}.catalogo_tl`
    );
    expect(catalogo.rows[0].n).toBe(4);
  });
});

describe('cancellare una categoria sistema i collegamenti nel catalogo', () => {
  it('toglie le sue TL e lascia intatte le altre', async () => {
    const esito = await eliminaCategoriaTipoDebitoAction(SCHEMA, 'DEBITO');

    expect(esito).toEqual({ success: true, codice: 'DEBITO', collegamentiRimossi: 2 });
    const catalogo = await ottieniLavorazioniTipoDebito(SCHEMA);
    expect(catalogo.lavorazioni.map((l) => l.categoria)).toEqual(['AVA', 'NEUTRO']);

    const categorie = await ottieniCategorieTipoDebito(SCHEMA);
    expect(categorie.categorie.map((c) => c.codice)).toEqual(['AVA', 'NEUTRO']);
  });

  it('la migrazione non le fa ricomparire alla riapertura', async () => {
    await ottieniLavorazioniTipoDebito(SCHEMA);
    const catalogo = await ottieniLavorazioniTipoDebito(SCHEMA);

    // Le righe storiche di DEBITO ci sono ancora (archivio), ma sono segnate:
    // senza la marcatura il triage ricreerebbe le TL appena cancellate.
    const storiche = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${SCHEMA}.lavorazioni_tipo_debito
        WHERE categoria = 'DEBITO' AND migrata_il IS NOT NULL`
    );
    expect(storiche.rows[0].n).toBe(2);
    expect(catalogo.lavorazioni.some((l) => l.categoria === 'DEBITO')).toBe(false);
  });

  it('una categoria che non esiste non tocca niente', async () => {
    const esito = await eliminaCategoriaTipoDebitoAction(SCHEMA, 'INVENTATA');

    expect(esito.success).toBe(false);
    expect(esito.error).toBe('Categoria non trovata.');
    const catalogo = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${SCHEMA}.catalogo_tl`
    );
    expect(catalogo.rows[0].n).toBe(2);
  });
});

describe('rinominare una categoria non lascia collegamenti orfani', () => {
  it('le TL restano legate al codice e la schermata mostra la nuova etichetta', async () => {
    await aggiornaCategoriaTipoDebitoAction(
      SCHEMA,
      'AVA',
      'Affidato all’Agente della Riscossione',
      'Crediti già affidati'
    );

    const catalogo = await ottieniLavorazioniTipoDebito(SCHEMA);
    const dellaCategoria = catalogo.lavorazioni.filter((l) => l.categoria === 'AVA');
    expect(dellaCategoria).toHaveLength(1);
    expect(dellaCategoria[0].destinatario).toBe('Presidio dei flussi informativi');

    // L'etichetta si legge dalle categorie, non è copiata nel catalogo: una
    // rinomina non può sdoppiarla.
    const categorie = await ottieniCategorieTipoDebito(SCHEMA);
    expect(categorie.categorie.find((c) => c.codice === 'AVA')?.etichetta).toBe(
      'Affidato all’Agente della Riscossione'
    );
  });
});

describe('le scritture del catalogo restano chiuse dal congelamento', () => {
  it('il salvataggio risponde con il motivo e non tocca il catalogo', async () => {
    const esito = await salvaLavorazioneTipoDebitoAction(SCHEMA, {
      categoria: 'AVA',
      lavorazione: 'Nuova lavorazione',
      destinatario: 'Ufficio Legale',
      attivo: true,
    });

    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/sola lettura/);
    const catalogo = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${SCHEMA}.catalogo_tl`
    );
    expect(catalogo.rows[0].n).toBe(2);
  });
});
