import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// La riapertura di un triage è la funzione che restituisce al database il
// compito di ricomporre una videata che prima viveva solo nel browser. Si prova
// su un Postgres vero (PGlite): la guardia è simulata, il resto no — SELECT,
// alias e tipi sono quelli che girano in produzione.
const db = await PGlite.create();

vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri) },
}));

const richiediAccessoAzienda = vi.fn(async () => ({
  modalita: 'ADMIN_SPAZIO' as const,
  email: 'anna@alfa.it',
}));
vi.mock('@/lib/autorizzazione', () => ({
  richiediAccessoAzienda,
  richiediAccessoSchema: vi.fn(async () => ({ modalita: 'ADMIN_SPAZIO' as const })),
}));

vi.mock('@/db/provision', () => ({ assicuraTabellaAziende: async () => undefined }));

const { ottieniVerificaDaRiprendereAction } = await import('./aziendaInVerifica');

const SCHEMA = 'tenant_alfa';
const AZIENDA = 4;

beforeEach(async () => {
  richiediAccessoAzienda.mockClear();
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.aziende (
      id SERIAL PRIMARY KEY,
      ragione_sociale TEXT,
      forma_giuridica TEXT,
      codice_fiscale TEXT,
      partita_iva TEXT,
      codice_ateco TEXT,
      numero_rea TEXT,
      capitale_sociale NUMERIC,
      indirizzo_sede_legale TEXT,
      citta TEXT,
      provincia TEXT,
      cap TEXT,
      rappresentante_legale TEXT,
      ruolo_rappresentante_legale TEXT,
      pec TEXT,
      anno_costituzione INTEGER,
      verifica_esito TEXT,
      in_verifica BOOLEAN NOT NULL DEFAULT FALSE,
      verifica_archiviata BOOLEAN NOT NULL DEFAULT FALSE,
      verifica_motivo TEXT,
      verifica_riferita_al DATE,
      verifica_eseguita_il TIMESTAMP
    );
  `);
});

describe('ottieniVerificaDaRiprendereAction', () => {
  it('restituisce anagrafica, data dichiarata e stato della decisione', async () => {
    await db.exec(`
      INSERT INTO ${SCHEMA}.aziende
        (id, ragione_sociale, partita_iva, forma_giuridica, capitale_sociale, anno_costituzione,
         verifica_esito, in_verifica, verifica_riferita_al, verifica_eseguita_il)
      VALUES (${AZIENDA}, 'Alfa Srl', '01234567890', 'SRL', 50000, 1998,
              'ROSSO', TRUE, DATE '2026-09-30', TIMESTAMP '2026-10-19 10:15:00')
    `);

    const esito = await ottieniVerificaDaRiprendereAction(SCHEMA, AZIENDA);

    expect(esito.success).toBe(true);
    expect(richiediAccessoAzienda).toHaveBeenCalledWith(SCHEMA, AZIENDA);
    expect(esito.verifica).toMatchObject({
      aziendaId: AZIENDA,
      // La data DICHIARATA, non quella dell'esecuzione: i conti del triage si
      // riferiscono a quella, e ricostruire il documento sull'altra cambierebbe
      // l'impronta di versione senza che nulla sia cambiato.
      dataVerifica: '2026-09-30',
      dataApprossimata: false,
      esito: 'ROSSO',
      inVerifica: true,
      archiviata: false,
    });
    expect(esito.verifica?.anagrafica).toMatchObject({
      ragioneSociale: 'Alfa Srl',
      partitaIva: '01234567890',
      formaGiuridica: 'SRL',
      capitaleSociale: 50_000,
      annoCostituzione: 1998,
    });
  });

  it('per le verifiche senza data dichiarata usa il giorno dell’esecuzione e lo dichiara', async () => {
    await db.exec(`
      INSERT INTO ${SCHEMA}.aziende
        (id, ragione_sociale, in_verifica, verifica_eseguita_il)
      VALUES (${AZIENDA}, 'Alfa Srl', TRUE, TIMESTAMP '2026-10-19 10:15:00')
    `);

    const esito = await ottieniVerificaDaRiprendereAction(SCHEMA, AZIENDA);

    expect(esito.verifica?.dataVerifica).toBe('2026-10-19');
    expect(esito.verifica?.dataApprossimata).toBe(true);
  });

  it('dice quando la verifica è già stata decisa', async () => {
    await db.exec(`
      INSERT INTO ${SCHEMA}.aziende
        (id, ragione_sociale, in_verifica, verifica_archiviata, verifica_motivo)
      VALUES (${AZIENDA}, 'Alfa Srl', FALSE, TRUE, 'Debito sotto soglia')
    `);

    const esito = await ottieniVerificaDaRiprendereAction(SCHEMA, AZIENDA);

    expect(esito.verifica?.inVerifica).toBe(false);
    expect(esito.verifica?.archiviata).toBe(true);
    expect(esito.verifica?.motivo).toBe('Debito sotto soglia');
  });

  it('non inventa una verifica che non esiste', async () => {
    const esito = await ottieniVerificaDaRiprendereAction(SCHEMA, 999);
    expect(esito.success).toBe(false);
    expect(esito.error).toContain('non trovata');
  });

  it('non legge se la guardia di accesso rifiuta', async () => {
    richiediAccessoAzienda.mockRejectedValueOnce(
      new Error('Azienda non assegnata a questo utente.')
    );

    const esito = await ottieniVerificaDaRiprendereAction(SCHEMA, AZIENDA);

    expect(esito.success).toBe(false);
    expect(esito.verifica).toBeUndefined();
  });
});
