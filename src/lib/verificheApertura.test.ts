import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { apriVerifica, leggiApertureVerifiche, type EsecutoreVerifiche } from './verificheApertura';

// La verifica aperta in ispezione non è un atto dell'ente: la modalità si
// scrive con l'autore e si rilegge, invece di dedurla dal nome di chi guarda.

const db = await PGlite.create();
const SCHEMA = 'tenant_prova_aperture_verifiche';
const esecutore = db as unknown as EsecutoreVerifiche;

beforeEach(async () => {
  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.aziende (id SERIAL PRIMARY KEY);
    INSERT INTO ${SCHEMA}.aziende (id) VALUES (1);
  `);
});

describe('la modalità d’apertura di una verifica', () => {
  it('scrive chi apre e in quale modalità, e non li sposta alla riapertura', async () => {
    const prima = await apriVerifica(
      SCHEMA,
      1,
      'CONTABILE',
      { nome: 'superadmin', id: null, modalita: 'SALVAGENTE' },
      esecutore
    );
    expect(prima.riaperta).toBe(true);
    const dopo = await apriVerifica(
      SCHEMA,
      1,
      'CONTABILE',
      { nome: 'anna.verdi', id: 7, modalita: 'ADMIN_SPAZIO' },
      esecutore
    );
    expect(dopo.riaperta).toBe(false);
    expect(dopo.apertaIl).toBe(prima.apertaIl);
    const [apertura] = await leggiApertureVerifiche(SCHEMA, 1, esecutore);
    expect(apertura).toMatchObject({
      tipo: 'CONTABILE',
      autore: 'superadmin',
      modalita: 'SALVAGENTE',
    });
  });

  it('lascia vuoti autore e modalità per le verifiche aperte prima', async () => {
    await apriVerifica(SCHEMA, 1, 'AZIENDALE', undefined, esecutore);
    const [apertura] = await leggiApertureVerifiche(SCHEMA, 1, esecutore);
    expect(apertura.autore).toBeNull();
    expect(apertura.modalita).toBeNull();
  });
});
