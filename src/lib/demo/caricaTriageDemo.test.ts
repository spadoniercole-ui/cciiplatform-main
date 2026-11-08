import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { componiReportUo } from '@/lib/lavorazioni/reportUo';

// Il caricamento della quinta azienda è SQL vero: la proviamo su Postgres in
// memoria (PGlite), con il resto del set demo svuotato. Così restano coperte
// la mappatura delle colonne e l'idempotenza del seed, che un test puro non
// vedrebbe.
const db = await PGlite.create();

const client = {
  query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri),
  release: () => undefined,
};

vi.mock('@/lib/db', () => ({
  pool: {
    query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri),
    connect: async () => client,
  },
}));

vi.mock('@/db/provision', () => ({
  assicuraTabellaAziende: async () => undefined,
  assicuraTabellaCategorieTipoDebito: async () => undefined,
  assicuraTabellaXbrlAzienda: async () => undefined,
  assicuraTabelleScreeningAzienda: async () => undefined,
  assicuraTabellaDebitiEnte: async () => undefined,
  assicuraTabelleParametriSpazio: async () => undefined,
  assicuraTabelleScenari: async () => undefined,
  assicuraTabelleScenariTriage: async () => undefined,
  assicuraTabelleTl: async () => undefined,
  assicuraTabelleVera: async () => undefined,
}));

vi.mock('@/db/provisionProdotti', () => ({
  assicuraTabelleProdotti: async () => undefined,
}));

vi.mock('./percorsoEnte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./percorsoEnte')>();
  return { ...actual, PERCORSO_DEMO: [] };
});

const { caricaPercorsoDemoEnte } = await import('./caricaPercorsoEnte');

const SCHEMA = 'tenant_triage';

beforeEach(async () => {
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.aziende (
      id SERIAL PRIMARY KEY,
      ragione_sociale TEXT NOT NULL,
      codice_fiscale TEXT,
      partita_iva TEXT,
      codice_ateco TEXT,
      forma_giuridica TEXT,
      indirizzo_sede_legale TEXT,
      citta TEXT,
      provincia TEXT,
      cap TEXT,
      capitale_sociale NUMERIC,
      rappresentante_legale TEXT,
      ruolo_rappresentante_legale TEXT,
      numero_rea TEXT,
      pec TEXT,
      anno_costituzione INTEGER,
      in_verifica BOOLEAN NOT NULL DEFAULT FALSE,
      verifica_esito TEXT,
      verifica_eseguita_il TIMESTAMP,
      verifica_riferita_al DATE,
      con_lavoratori_subordinati BOOLEAN,
      contributi_scaduti NUMERIC,
      contributi_dovuti_anno_precedente NUMERIC,
      anno_contributi_dovuti INTEGER,
      volume_affari NUMERIC,
      ritardo_oltre_90_giorni BOOLEAN,
      periodi_in_ritardo INTEGER,
      soglie_aggiornate_al DATE
    );
    CREATE TABLE ${SCHEMA}.debiti_ente (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      voce TEXT NOT NULL,
      importo NUMERIC NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'DEBITO',
      note TEXT
    );
    CREATE TABLE ${SCHEMA}.debiti_vera (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      sezione TEXT NOT NULL,
      voce TEXT NOT NULL,
      importo NUMERIC NOT NULL DEFAULT 0,
      categoria TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT '',
      trattamento TEXT NOT NULL DEFAULT 'contabilizzato',
      periodo TEXT NOT NULL DEFAULT '',
      contributi NUMERIC,
      sanzioni NUMERIC,
      ambito TEXT NOT NULL DEFAULT 'INPS'
    );
    CREATE TABLE ${SCHEMA}.prodotti_ente (
      id SERIAL PRIMARY KEY,
      direttrice TEXT NOT NULL DEFAULT '',
      nome TEXT NOT NULL DEFAULT '',
      in_checklist BOOLEAN NOT NULL DEFAULT false,
      domande JSONB NOT NULL DEFAULT '[]'::jsonb,
      ordine INTEGER NOT NULL DEFAULT 0,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE TABLE ${SCHEMA}.categorie_tipo_debito (
      codice TEXT PRIMARY KEY,
      etichetta TEXT NOT NULL,
      descrizione TEXT,
      ordine INTEGER NOT NULL DEFAULT 0,
      attivo BOOLEAN NOT NULL DEFAULT TRUE,
      contribuisce BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE ${SCHEMA}.tl (
      id SERIAL PRIMARY KEY,
      codice TEXT NOT NULL DEFAULT '',
      descrizione TEXT NOT NULL DEFAULT '',
      check_list BOOLEAN NOT NULL DEFAULT false,
      ordine INTEGER NOT NULL DEFAULT 0,
      direttrice TEXT,
      prodotto TEXT,
      prodotti JSONB NOT NULL DEFAULT '[]'::jsonb
    );
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
    CREATE TABLE ${SCHEMA}.materie_ente (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      codici_indicativi TEXT,
      presupposto_giuridico TEXT,
      stato TEXT NOT NULL DEFAULT 'DA_RICERCARE',
      confermata_da TEXT,
      confermata_il TIMESTAMP,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE TABLE ${SCHEMA}.titoli_ente (
      id SERIAL PRIMARY KEY,
      codice TEXT NOT NULL UNIQUE,
      atto TEXT NOT NULL,
      presupposto_giuridico TEXT NOT NULL DEFAULT '',
      effetto_calcolo TEXT NOT NULL DEFAULT 'NESSUNO',
      materia_id INTEGER,
      dipendenza TEXT
    );
  `);
});

describe('caricamento demo — quinta azienda al triage', () => {
  it('crea una sola azienda in verifica, con le posizioni e senza screening', async () => {
    const primo = await caricaPercorsoDemoEnte(SCHEMA, { soloPercorsi: true });

    expect(primo).toEqual({ creati: 1, esistenti: 0 });

    const aziende = await db.query<{
      id: number;
      ragione_sociale: string;
      in_verifica: boolean;
      verifica_esito: string | null;
      verifica_riferita_al: string | null;
      con_lavoratori_subordinati: boolean | null;
      volume_affari: string | null;
    }>(
      `SELECT id, ragione_sociale, in_verifica, verifica_esito,
              to_char(verifica_riferita_al, 'YYYY-MM-DD') AS verifica_riferita_al,
              con_lavoratori_subordinati, volume_affari
         FROM ${SCHEMA}.aziende`
    );

    expect(aziende.rows).toHaveLength(1);
    expect(aziende.rows[0]).toMatchObject({
      ragione_sociale: 'Impianti Adriatica Demo S.r.l.',
      in_verifica: true,
      verifica_esito: 'ROSSO',
      verifica_riferita_al: '2026-11-05',
      con_lavoratori_subordinati: true,
      volume_affari: '1050000',
    });

    const posizioni = await db.query<{ voce: string; importo: string; tipo: string }>(
      `SELECT voce, importo, tipo FROM ${SCHEMA}.debiti_ente ORDER BY id`
    );
    expect(posizioni.rows).toEqual([
      { voce: 'TS 27 flusso Uniemens non versato', importo: '176595.98', tipo: 'DEBITO' },
      { voce: 'TS 25 nota di rettifica', importo: '3404.02', tipo: 'DEBITO' },
      { voce: 'TS 81 Verbale evasione', importo: '25000', tipo: 'DEBITO' },
    ]);

    const certificazione = await db.query<{
      voce: string;
      stato: string;
      periodo: string;
      contributi: string | null;
      sanzioni: string | null;
      trattamento: string;
      ambito: string;
    }>(
      `SELECT voce, stato, periodo, contributi, sanzioni, trattamento, ambito
         FROM ${SCHEMA}.debiti_vera ORDER BY id`
    );
    expect(certificazione.rows).toEqual([
      {
        voce: 'TS 27 flusso Uniemens non versato',
        stato: 'Da contabilizzare',
        periodo: '202506 - 202512',
        contributi: '176595.98',
        sanzioni: null,
        trattamento: 'da_contabilizzare',
        ambito: 'INPS',
      },
      {
        voce: 'TS 25 nota di rettifica',
        stato: 'Da contabilizzare',
        periodo: '202506 - 202506',
        contributi: '3404.02',
        sanzioni: null,
        trattamento: 'da_contabilizzare',
        ambito: 'INPS',
      },
      {
        voce: 'TS 81 Verbale evasione',
        stato: 'Da contabilizzare',
        periodo: '2025',
        contributi: null,
        sanzioni: '25000',
        trattamento: 'da_contabilizzare',
        ambito: 'INPS',
      },
    ]);

    const prodotti = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.prodotti_ente`
    );
    expect(prodotti.rows[0].n).toBe(3);
  });

  it('configura materie, titoli e lavorazioni reali, e il report UO è pronto', async () => {
    await caricaPercorsoDemoEnte(SCHEMA, { soloPercorsi: true });

    const [righe, titoli, materie, lavorazioni] = await Promise.all([
      db.query<{
        sezione: string;
        voce: string;
        categoria: string;
        periodo: string;
        stato: string;
        importo: string;
        trattamento: string;
      }>(
        `SELECT sezione, voce, categoria, periodo, stato, importo, trattamento
           FROM ${SCHEMA}.debiti_vera ORDER BY id`
      ),
      db.query<{ codice: string; materia_id: number | null; dipendenza: string | null }>(
        `SELECT codice, materia_id, dipendenza FROM ${SCHEMA}.titoli_ente ORDER BY codice`
      ),
      db.query<{
        id: number;
        nome: string;
        codici_indicativi: string | null;
        stato: string;
      }>(`SELECT id, nome, codici_indicativi, stato FROM ${SCHEMA}.materie_ente ORDER BY id`),
      db.query<{
        id: number;
        materia_id: number;
        codice: string;
        descrizione: string;
        direttrice: string;
        prodotto: string;
        dipendenza: string | null;
        procedura: string | null;
        esito: string | null;
        ordine: number;
      }>(
        `SELECT a.id, a.materia_id, t.codice, t.descrizione, a.direttrice, a.prodotto,
                a.dipendenza, a.procedura, a.esito, a.ordine
           FROM ${SCHEMA}.materia_tl a
           JOIN ${SCHEMA}.tl t ON t.id = a.tl_id
          ORDER BY a.ordine, t.id`
      ),
    ]);

    expect(titoli.rows.map((t) => t.codice)).toEqual(['25', '27', '81']);
    expect(materie.rows.map((m) => m.nome)).toEqual([
      'Flussi Uniemens',
      'Note di rettifica',
      'Verbali e vigilanza',
    ]);
    expect(materie.rows.every((m) => m.stato === 'CONFERMATA')).toBe(true);
    expect(lavorazioni.rows.map((l) => l.dipendenza)).toEqual([
      'Unità operativa contributi',
      'Unità operativa contributi',
      'Unità operativa vigilanza',
    ]);

    const report = componiReportUo({
      azienda: 'Impianti Adriatica Demo S.r.l.',
      dataVerifica: '2026-11-05',
      righe: righe.rows.map((r) => ({
        sezione: r.sezione,
        voce: r.voce,
        categoria: r.categoria,
        periodo: r.periodo,
        stato: r.stato,
        importo: Number(r.importo),
        trattamento: 'da_contabilizzare' as const,
      })),
      titoli: titoli.rows.map((t) => ({
        codice: t.codice,
        materiaId: t.materia_id === null ? null : Number(t.materia_id),
        dipendenza: t.dipendenza,
      })),
      materie: materie.rows.map((m) => ({
        id: Number(m.id),
        nome: m.nome,
        codiciIndicativi: m.codici_indicativi,
        stato: 'CONFERMATA' as const,
      })),
      lavorazioni: lavorazioni.rows.map((l) => ({
        id: Number(l.id),
        materiaId: Number(l.materia_id),
        codice: l.codice,
        tipologia: l.descrizione,
        direttrice: l.direttrice,
        prodotto: l.prodotto,
        dipendenza: l.dipendenza,
        procedura: l.procedura,
        esito: l.esito,
        ordine: Number(l.ordine),
      })),
    });

    expect(report.documenti.map((d) => d.dipendenza).sort()).toEqual([
      'Unità operativa contributi',
      'Unità operativa vigilanza',
    ]);
    const contributi = report.documenti.find((d) => d.dipendenza === 'Unità operativa contributi')!;
    expect(contributi.righe).toBe(2);
    expect(contributi.totale).toBeCloseTo(180_000, 2);
    expect(contributi.codici.map((c) => c.codice)).toEqual(['25', '27']);
    const vigilanza = report.documenti.find((d) => d.dipendenza === 'Unità operativa vigilanza')!;
    expect(vigilanza.righe).toBe(1);
    expect(vigilanza.totale).toBeCloseTo(25_000, 2);
    expect(vigilanza.codici.map((c) => c.codice)).toEqual(['81']);
    expect(report.senzaDipendenza).toEqual([]);
  });

  it('non duplica la quinta azienda se il percorso viene ricaricato', async () => {
    await caricaPercorsoDemoEnte(SCHEMA, { soloPercorsi: true });
    const secondo = await caricaPercorsoDemoEnte(SCHEMA, { soloPercorsi: true });

    expect(secondo).toEqual({ creati: 0, esistenti: 1 });
    const aziende = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.aziende`
    );
    const posizioni = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.debiti_ente`
    );
    expect(aziende.rows[0].n).toBe(1);
    expect(posizioni.rows[0].n).toBe(3);

    const prodotti = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.prodotti_ente`
    );
    expect(prodotti.rows[0].n).toBe(3);
  });

  it('riallinea una demo creata con il vecchio seed contabilizzato', async () => {
    await caricaPercorsoDemoEnte(SCHEMA, { soloPercorsi: true });
    await db.exec(`
      UPDATE ${SCHEMA}.debiti_vera
         SET voce = 'Contributi previdenziali scaduti', importo = 180000,
             trattamento = 'contabilizzato', stato = '', periodo = '',
             contributi = 180000, sanzioni = NULL
       WHERE voce = 'TS 27 flusso Uniemens non versato';
      DELETE FROM ${SCHEMA}.debiti_vera WHERE voce = 'TS 25 nota di rettifica';
      UPDATE ${SCHEMA}.debiti_vera
         SET voce = 'Sanzioni civili contributive', importo = 25000,
             trattamento = 'contabilizzato', stato = '', periodo = '',
             contributi = NULL, sanzioni = 25000
       WHERE voce = 'TS 81 Verbale evasione';
      UPDATE ${SCHEMA}.debiti_ente
         SET voce = 'Contributi previdenziali scaduti', importo = 180000
       WHERE voce = 'TS 27 flusso Uniemens non versato';
      DELETE FROM ${SCHEMA}.debiti_ente WHERE voce = 'TS 25 nota di rettifica';
      UPDATE ${SCHEMA}.debiti_ente
         SET voce = 'Sanzioni civili contributive', importo = 25000
       WHERE voce = 'TS 81 Verbale evasione';
    `);

    await caricaPercorsoDemoEnte(SCHEMA, { soloPercorsi: true });

    const certificazione = await db.query<{ voce: string; trattamento: string }>(
      `SELECT voce, trattamento FROM ${SCHEMA}.debiti_vera ORDER BY voce`
    );
    expect(certificazione.rows).toEqual([
      { voce: 'TS 25 nota di rettifica', trattamento: 'da_contabilizzare' },
      { voce: 'TS 27 flusso Uniemens non versato', trattamento: 'da_contabilizzare' },
      { voce: 'TS 81 Verbale evasione', trattamento: 'da_contabilizzare' },
    ]);
    const posizioni = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.debiti_ente`
    );
    expect(posizioni.rows[0].n).toBe(3);
  });

  it('con soloTriage assicura la quinta posizione senza duplicarla', async () => {
    const primo = await caricaPercorsoDemoEnte(SCHEMA, { soloTriage: true });
    const secondo = await caricaPercorsoDemoEnte(SCHEMA, { soloTriage: true });

    expect(primo.creati).toBe(1);
    expect(secondo.creati).toBe(0);
    const aziende = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.aziende`
    );
    expect(aziende.rows[0].n).toBe(1);
  });
});
