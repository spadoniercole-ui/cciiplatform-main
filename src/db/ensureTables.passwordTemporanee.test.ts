import { describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// oscuraPasswordTemporanee su un Postgres vero (PGlite): le password
// temporanee salvate in chiaro fino alla 0.115 diventano il marcatore, le
// altre righe non cambiano.
const db = await PGlite.create();
vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri) },
}));

const { oscuraPasswordTemporanee } = await import('./ensureTables');
const { PASSWORD_DA_CAMBIARE, richiedeCambioPassword } = await import('@/lib/passwordTemporanea');

describe('oscuraPasswordTemporanee', () => {
  it('sostituisce le password in chiaro con il marcatore, idempotente', async () => {
    await db.exec(`
      CREATE SCHEMA tenant_prova;
      CREATE TABLE tenant_prova.admin_workspace (id SERIAL PRIMARY KEY, password_temporanea TEXT);
      CREATE TABLE tenant_prova.utenti_spazio (id SERIAL PRIMARY KEY, password_temporanea TEXT);
      INSERT INTO tenant_prova.admin_workspace (password_temporanea) VALUES ('eHs8EWkPJpDt'), (NULL), ('');
      INSERT INTO tenant_prova.utenti_spazio (password_temporanea) VALUES ('Xy12AbCd'), ('${PASSWORD_DA_CAMBIARE}');
      CREATE SCHEMA tenant_vecchio;
      CREATE TABLE tenant_vecchio.admin_workspace (id SERIAL PRIMARY KEY, password_temporanea TEXT);
      INSERT INTO tenant_vecchio.admin_workspace (password_temporanea) VALUES ('Segreta123');
    `);

    await oscuraPasswordTemporanee('tenant_prova');
    await oscuraPasswordTemporanee('tenant_prova');
    // Schema senza utenti_spazio (creato prima degli operatori): nessun errore.
    await oscuraPasswordTemporanee('tenant_vecchio');

    const admin = await db.query<{ password_temporanea: string | null }>(
      'SELECT password_temporanea FROM tenant_prova.admin_workspace ORDER BY id'
    );
    expect(admin.rows.map((r) => r.password_temporanea)).toEqual([PASSWORD_DA_CAMBIARE, null, '']);
    const utenti = await db.query<{ password_temporanea: string }>(
      'SELECT password_temporanea FROM tenant_prova.utenti_spazio ORDER BY id'
    );
    expect(utenti.rows.map((r) => r.password_temporanea)).toEqual([
      PASSWORD_DA_CAMBIARE,
      PASSWORD_DA_CAMBIARE,
    ]);
    const vecchio = await db.query<{ password_temporanea: string }>(
      'SELECT password_temporanea FROM tenant_vecchio.admin_workspace'
    );
    expect(vecchio.rows[0].password_temporanea).toBe(PASSWORD_DA_CAMBIARE);

    // Il significato non cambia: chi aveva la password temporanea deve ancora cambiarla.
    expect(richiedeCambioPassword(PASSWORD_DA_CAMBIARE)).toBe(true);
    expect(richiedeCambioPassword(null)).toBe(false);
    expect(richiedeCambioPassword('')).toBe(false);
  });

  it('ignora nomi di schema non validi', async () => {
    await expect(oscuraPasswordTemporanee('x"; DROP TABLE y; --')).resolves.toBeUndefined();
  });
});
