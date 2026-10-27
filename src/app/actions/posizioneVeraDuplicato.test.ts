import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// LA SCELTA REGISTRATA INSIEME ALLA POSIZIONE, provata su un Postgres vero
// (PGlite): la guardia di accesso è simulata, il resto no — DDL, UPDATE con le
// condizioni e SELECT sono quelli che girano in produzione. È il punto che i
// test puri non coprono: un nome di colonna sbagliato o un valore scritto male
// si vedrebbero solo qui, e in verifica non tornerebbe la scelta fatta.
const db = await PGlite.create();

vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri) },
}));

const richiediAccessoSchema = vi.fn(async () => ({
  modalita: 'ADMIN_SPAZIO' as const,
  email: 'anna@alfa.it',
}));
vi.mock('@/lib/autorizzazione', () => ({
  richiediAccessoSchema,
  richiediAccessoAzienda: richiediAccessoSchema,
}));

// Il DDL è lo stesso di src/db/provision.ts (assicuraTabelleVera): qui è
// ricopiato perché il modulo vero parla con il database configurato, non con il
// PGlite del test.
vi.mock('@/db/provision', () => ({
  assicuraTabelleVera: async (nomeSchema: string) => {
    await db.exec(`CREATE SCHEMA IF NOT EXISTS "${nomeSchema}"`);
    await db.exec(`CREATE TABLE IF NOT EXISTS "${nomeSchema}".debiti_vera (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      sezione TEXT NOT NULL DEFAULT '',
      ambito TEXT NOT NULL DEFAULT 'INPS',
      voce TEXT NOT NULL DEFAULT '',
      importo NUMERIC(15,2) NOT NULL DEFAULT 0,
      contributi NUMERIC,
      sanzioni NUMERIC,
      categoria TEXT NOT NULL DEFAULT '',
      stato TEXT NOT NULL DEFAULT '',
      trattamento TEXT NOT NULL DEFAULT 'contabilizzato',
      combinazione TEXT NOT NULL DEFAULT '',
      documento_id INTEGER,
      periodo TEXT NOT NULL DEFAULT '',
      duplicato_stato TEXT NOT NULL DEFAULT ''
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS "${nomeSchema}".vera_titoli (
      id SERIAL PRIMARY KEY,
      titolo TEXT NOT NULL,
      titolo_norm TEXT NOT NULL,
      categoria TEXT NOT NULL
    )`);
  },
  assicuraTabelleParametriSpazio: async (nomeSchema: string) => {
    await db.exec(`CREATE TABLE IF NOT EXISTS "${nomeSchema}".titoli_ente (
      id SERIAL PRIMARY KEY, codice TEXT NOT NULL, materia_id INTEGER
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS "${nomeSchema}".materie_ente (
      id SERIAL PRIMARY KEY, nome TEXT NOT NULL, codici_indicativi TEXT, stato TEXT
    )`);
  },
}));

const { impostaDuplicatoVeraAction, ottieniDebitiVera } = await import('./posizioneVera');
const { assicuraTabelleVera } = await import('@/db/provision');

const SCHEMA = 'tenant_alfa';
const AZIENDA = 4;
const ALTRA_AZIENDA = 9;

/** Due righe per l'azienda 4: l'F24 e la denuncia che ripete la stessa cifra. */
async function popola(): Promise<void> {
  await db.exec(`DELETE FROM "${SCHEMA}".debiti_vera`);
  await db.exec(`INSERT INTO "${SCHEMA}".debiti_vera
      (azienda_id, sezione, voce, importo, contributi, categoria, stato, trattamento, periodo)
    VALUES
      (${AZIENDA}, 'Gestione', 'F24 Non presentato', 9590, 9590, 'CONTRIBUTI', '', 'contabilizzato', '06/2026'),
      (${AZIENDA}, 'Gestione', 'Denunce non trasmesse', 9590, 0, 'CONTRIBUTI', '', 'contabilizzato', '2026-06-01'),
      (${ALTRA_AZIENDA}, 'Gestione', 'Denunce non trasmesse', 9590, 0, 'CONTRIBUTI', '', 'contabilizzato', '2026-06-01')`);
}

async function idDenunceDi(aziendaId: number): Promise<number> {
  const r = await db.query<{ id: number }>(
    `SELECT id FROM "${SCHEMA}".debiti_vera WHERE azienda_id = $1 AND voce = 'Denunce non trasmesse'`,
    [aziendaId]
  );
  return Number(r.rows[0].id);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await assicuraTabelleVera(SCHEMA);
  await popola();
});

describe('impostaDuplicatoVeraAction', () => {
  it('registra la scelta sulla riga denunce, e la riga se la riporta dietro', async () => {
    const id = await idDenunceDi(AZIENDA);
    const esito = await impostaDuplicatoVeraAction(SCHEMA, AZIENDA, id, 'NEGATO');
    expect(esito.success).toBe(true);

    const lette = await ottieniDebitiVera(SCHEMA, AZIENDA);
    expect(lette.success).toBe(true);
    const denunce = lette.righe.find((r) => r.id === id)!;
    expect(denunce.duplicatoStato).toBe('NEGATO');
    // L'altra riga della coppia resta com'era: la scelta è della denuncia.
    expect(lette.righe.find((r) => r.id !== id)?.duplicatoStato).toBe('');
  });

  it('si può tornare al riconoscimento automatico', async () => {
    const id = await idDenunceDi(AZIENDA);
    await impostaDuplicatoVeraAction(SCHEMA, AZIENDA, id, 'CONFERMATO');
    const ritorno = await impostaDuplicatoVeraAction(SCHEMA, AZIENDA, id, '');
    expect(ritorno.success).toBe(true);
    const lette = await ottieniDebitiVera(SCHEMA, AZIENDA);
    expect(lette.righe.find((r) => r.id === id)?.duplicatoStato).toBe('');
  });

  it('non tocca la riga di un’altra azienda dello stesso spazio', async () => {
    const altrui = await idDenunceDi(ALTRA_AZIENDA);
    const esito = await impostaDuplicatoVeraAction(SCHEMA, AZIENDA, altrui, 'NEGATO');
    expect(esito.success).toBe(false);
    expect(esito.error).toMatch(/non trovata in questa posizione/i);

    const r = await db.query<{ duplicato_stato: string }>(
      `SELECT duplicato_stato FROM "${SCHEMA}".debiti_vera WHERE id = $1`,
      [altrui]
    );
    expect(r.rows[0].duplicato_stato).toBe('');
  });

  it('rifiuta una scelta che non esiste e gli identificativi non validi', async () => {
    const id = await idDenunceDi(AZIENDA);
    for (const valore of ['FORSE', 'confermato', 'SI'] as const) {
      const esito = await impostaDuplicatoVeraAction(
        SCHEMA,
        AZIENDA,
        id,
        valore as unknown as 'CONFERMATO'
      );
      expect(esito.success).toBe(false);
      expect(esito.error).toMatch(/scelta non riconosciuta/i);
    }
    expect((await impostaDuplicatoVeraAction(SCHEMA, 0, id, 'NEGATO')).success).toBe(false);
    expect((await impostaDuplicatoVeraAction(SCHEMA, AZIENDA, 0, 'NEGATO')).success).toBe(false);
    expect((await impostaDuplicatoVeraAction(SCHEMA, AZIENDA, 999_999, 'NEGATO')).error).toMatch(
      /non trovata/i
    );
  });
});
