import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// Le due azioni del registro provate su un Postgres vero (PGlite): la guardia
// di accesso è simulata, il resto no — DDL, INSERT, RETURNING e SELECT sono
// quelli che girano in produzione. È il punto che i test puri non coprono: un
// alias sbagliato in RETURNING o un importo letto come stringa si vedrebbero
// solo qui.
const db = await PGlite.create();

vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri) },
}));

const richiediAccessoAzienda = vi.fn(async () => ({
  modalita: 'ADMIN_SPAZIO' as const,
  email: 'anna@alfa.it',
}));
vi.mock('@/lib/autorizzazione', () => ({ richiediAccessoAzienda }));

// Il DDL è lo stesso di src/db/provision.ts (assicuraTabellaConsegneReparti):
// qui è ricopiato perché il modulo vero parla con drizzle verso il database
// configurato, non con il PGlite del test.
vi.mock('@/db/provision', () => ({
  assicuraTabellaConsegneReparti: async (nomeSchema: string) => {
    await db.exec(`CREATE TABLE IF NOT EXISTS "${nomeSchema}".consegne_reparti (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES "${nomeSchema}".aziende(id) ON DELETE CASCADE,
      reparto TEXT NOT NULL,
      data_verifica DATE NOT NULL,
      versione TEXT NOT NULL,
      nome_file TEXT NOT NULL,
      righe INTEGER NOT NULL DEFAULT 0,
      totale NUMERIC(15,2) NOT NULL DEFAULT 0,
      posizioni_da_contabilizzare INTEGER NOT NULL DEFAULT 0,
      importo_da_contabilizzare NUMERIC(15,2) NOT NULL DEFAULT 0,
      consegnato_il TIMESTAMPTZ NOT NULL DEFAULT now(),
      consegnato_da TEXT,
      inviata_il DATE,
      mezzo_invio TEXT,
      note_invio TEXT,
      invio_confermato_il TIMESTAMPTZ,
      invio_confermato_da TEXT
    )`);
  },
}));

const { confermaInvioConsegnaAction, ottieniConsegneRepartiAction, registraConsegnaRepartoAction } =
  await import('./consegneReparti');

const SCHEMA = 'tenant_alfa';
const AZIENDA = 4;

const consegna = {
  reparto: 'Ufficio contributi',
  dataVerifica: '2026-10-19',
  versione: '1-3f9a1c2b',
  nomeFile: 'comunica_reparti_alfa_srl_ufficio_contributi.pdf',
  righe: 2,
  totale: 15_000,
  posizioniDaContabilizzare: 1,
  importoDaContabilizzare: 3_000,
};

/** Righe nel registro, anche quando la tabella non è ancora stata creata. */
async function righeRegistrate(): Promise<number> {
  const tabella = await db.query(`SELECT to_regclass('${SCHEMA}.consegne_reparti') AS t`);
  if (!(tabella.rows[0] as { t: string | null }).t) return 0;
  const conteggio = await db.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.consegne_reparti`);
  return (conteggio.rows[0] as { n: number }).n;
}

beforeEach(async () => {
  richiediAccessoAzienda.mockClear();
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.aziende (id SERIAL PRIMARY KEY, ragione_sociale TEXT);
    INSERT INTO ${SCHEMA}.aziende (id, ragione_sociale) VALUES (${AZIENDA}, 'Alfa Srl');
  `);
});

describe('registraConsegnaRepartoAction', () => {
  it('registra reparto, data, versione e totali', async () => {
    const esito = await registraConsegnaRepartoAction(SCHEMA, AZIENDA, consegna);

    expect(esito.success).toBe(true);
    expect(richiediAccessoAzienda).toHaveBeenCalledWith(SCHEMA, AZIENDA);
    expect(esito.consegna).toMatchObject({
      reparto: 'Ufficio contributi',
      dataVerifica: '2026-10-19',
      versione: '1-3f9a1c2b',
      righe: 2,
      totale: 15_000,
      posizioniDaContabilizzare: 1,
      importoDaContabilizzare: 3_000,
      consegnatoDa: 'anna@alfa.it',
    });
    expect(esito.consegna?.consegnatoIl).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('rifiuta un documento che non può essere vero e non scrive nulla', async () => {
    const esito = await registraConsegnaRepartoAction(SCHEMA, AZIENDA, {
      ...consegna,
      versione: 'inventata',
    });

    expect(esito.success).toBe(false);
    expect(esito.error).toContain('Versione');
    expect(esito.consegna).toBeUndefined();
    expect(await righeRegistrate()).toBe(0);
  });

  it('non scrive se la guardia di accesso rifiuta', async () => {
    richiediAccessoAzienda.mockRejectedValueOnce(
      new Error('Azienda non assegnata a questo utente.')
    );

    const esito = await registraConsegnaRepartoAction(SCHEMA, AZIENDA, consegna);

    expect(esito.success).toBe(false);
    expect(await righeRegistrate()).toBe(0);
  });

  it('un’azienda inesistente non crea righe orfane', async () => {
    const esito = await registraConsegnaRepartoAction(SCHEMA, 999, consegna);

    expect(esito.success).toBe(false);
    expect(esito.error).toContain('Consegna non registrata');
    expect(await righeRegistrate()).toBe(0);
  });

  it('in ispezione del Superadmin firma la consegna come tale', async () => {
    richiediAccessoAzienda.mockResolvedValueOnce({
      modalita: 'SALVAGENTE',
      email: undefined,
    } as never);

    const esito = await registraConsegnaRepartoAction(SCHEMA, AZIENDA, consegna);
    expect(esito.consegna?.consegnatoDa).toBe('Superadmin (ispezione)');
  });
});

describe('ottieniConsegneRepartiAction', () => {
  it('restituisce le consegne dalla più recente, con i totali come numeri', async () => {
    await registraConsegnaRepartoAction(SCHEMA, AZIENDA, consegna);
    await registraConsegnaRepartoAction(SCHEMA, AZIENDA, {
      ...consegna,
      reparto: 'Ufficio riscossione',
      versione: '1-bbbbbbbb',
      totale: 900,
      posizioniDaContabilizzare: 0,
      importoDaContabilizzare: 0,
    });

    const esito = await ottieniConsegneRepartiAction(SCHEMA, AZIENDA);
    expect(esito.success).toBe(true);
    expect(esito.consegne).toHaveLength(2);
    expect(esito.consegne.map((c) => c.reparto).sort()).toEqual([
      'Ufficio contributi',
      'Ufficio riscossione',
    ]);
    expect(typeof esito.consegne[0].totale).toBe('number');
    expect(esito.consegne.every((c) => typeof c.dataVerifica === 'string')).toBe(true);
  });

  it('non mostra le consegne di altre aziende', async () => {
    await db.exec(`INSERT INTO ${SCHEMA}.aziende (id, ragione_sociale) VALUES (5, 'Beta Srl')`);
    await registraConsegnaRepartoAction(SCHEMA, AZIENDA, consegna);
    await registraConsegnaRepartoAction(SCHEMA, 5, { ...consegna, reparto: 'Ragioneria' });

    const esito = await ottieniConsegneRepartiAction(SCHEMA, 5);
    expect(esito.consegne.map((c) => c.reparto)).toEqual(['Ragioneria']);
  });
});

describe('confermaInvioConsegnaAction', () => {
  const conferma = { inviataIl: '2026-10-19', mezzo: 'PEC', note: 'protocollo 77' };

  /** La riga appena scaricata: la conferma si aggancia a quella. */
  async function scarica(): Promise<number> {
    const r = await registraConsegnaRepartoAction(SCHEMA, AZIENDA, consegna);
    if (!r.consegna) throw new Error('consegna non registrata');
    return r.consegna.id;
  }

  it('registra data, mezzo, note e chi ha dichiarato l’invio', async () => {
    const id = await scarica();

    const esito = await confermaInvioConsegnaAction(SCHEMA, AZIENDA, id, conferma);

    expect(esito.success).toBe(true);
    expect(richiediAccessoAzienda).toHaveBeenCalledWith(SCHEMA, AZIENDA);
    expect(esito.consegna?.invio).toMatchObject({
      inviataIl: '2026-10-19',
      mezzo: 'PEC',
      note: 'protocollo 77',
      confermatoDa: 'anna@alfa.it',
    });
    expect(esito.consegna?.invio?.confermatoIl).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('la conferma si rilegge dal registro insieme alla consegna', async () => {
    const id = await scarica();
    await confermaInvioConsegnaAction(SCHEMA, AZIENDA, id, conferma);

    const registro = await ottieniConsegneRepartiAction(SCHEMA, AZIENDA);
    expect(registro.consegne).toHaveLength(1);
    expect(registro.consegne[0].invio).toMatchObject({
      inviataIl: '2026-10-19',
      mezzo: 'PEC',
      note: 'protocollo 77',
      confermatoDa: 'anna@alfa.it',
    });
  });

  it('non sovrascrive una conferma già scritta', async () => {
    const id = await scarica();
    await confermaInvioConsegnaAction(SCHEMA, AZIENDA, id, conferma);

    const seconda = await confermaInvioConsegnaAction(SCHEMA, AZIENDA, id, {
      inviataIl: '2026-10-20',
      mezzo: 'EMAIL',
      note: null,
    });

    expect(seconda.success).toBe(false);
    expect(seconda.error).toContain('già stato confermato');
    const registro = await ottieniConsegneRepartiAction(SCHEMA, AZIENDA);
    expect(registro.consegne[0].invio).toMatchObject({
      inviataIl: '2026-10-19',
      mezzo: 'PEC',
      note: 'protocollo 77',
    });
  });

  it('rifiuta un invio che non può essere vero e non scrive nulla', async () => {
    const id = await scarica();
    const fraTreGiorni = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

    const esito = await confermaInvioConsegnaAction(SCHEMA, AZIENDA, id, {
      ...conferma,
      inviataIl: fraTreGiorni,
    });

    expect(esito.success).toBe(false);
    expect(esito.error).toContain('futuro');
    const registro = await ottieniConsegneRepartiAction(SCHEMA, AZIENDA);
    expect(registro.consegne[0].invio).toBeNull();
  });

  it('rifiuta un mezzo fuori elenco', async () => {
    const id = await scarica();
    const esito = await confermaInvioConsegnaAction(SCHEMA, AZIENDA, id, {
      ...conferma,
      mezzo: 'TELEGRAMMA',
    });

    expect(esito.success).toBe(false);
    expect(esito.error).toContain('mezzo');
  });

  it('non conferma la consegna di un’altra azienda', async () => {
    await db.exec(`INSERT INTO ${SCHEMA}.aziende (id, ragione_sociale) VALUES (5, 'Beta Srl')`);
    const id = await scarica();

    const esito = await confermaInvioConsegnaAction(SCHEMA, 5, id, conferma);

    expect(esito.success).toBe(false);
    expect(esito.error).toContain('non trovata');
    const registro = await ottieniConsegneRepartiAction(SCHEMA, AZIENDA);
    expect(registro.consegne[0].invio).toBeNull();
  });

  it('non scrive se la guardia di accesso rifiuta', async () => {
    const id = await scarica();
    richiediAccessoAzienda.mockRejectedValueOnce(
      new Error('Azienda non assegnata a questo utente.')
    );

    const esito = await confermaInvioConsegnaAction(SCHEMA, AZIENDA, id, conferma);

    expect(esito.success).toBe(false);
    const registro = await ottieniConsegneRepartiAction(SCHEMA, AZIENDA);
    expect(registro.consegne[0].invio).toBeNull();
  });

  it('in ispezione del Superadmin firma la conferma come tale', async () => {
    const id = await scarica();
    richiediAccessoAzienda.mockResolvedValueOnce({
      modalita: 'SALVAGENTE',
      email: undefined,
    } as never);

    const esito = await confermaInvioConsegnaAction(SCHEMA, AZIENDA, id, conferma);
    expect(esito.consegna?.invio?.confermatoDa).toBe('Superadmin (ispezione)');
  });

  it('rifiuta un id di consegna impossibile senza toccare il database', async () => {
    const esito = await confermaInvioConsegnaAction(SCHEMA, AZIENDA, 0, conferma);
    expect(esito.success).toBe(false);
    expect(esito.error).toContain('Consegna non valida');
    expect(await righeRegistrate()).toBe(0);
  });
});
