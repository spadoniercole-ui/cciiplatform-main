import { beforeEach, describe, expect, it, vi } from 'vitest';

// I COLLEGAMENTI FRA CATEGORIE DI DEBITO E CATALOGO DELLE TS.
//
// Dalla 0.159.0 la pagina non scrive più una tabella propria: collega una
// categoria di debito a una TS del catalogo piatto (`tl`). Le due server action
// sono endpoint pubblici, quindi le si chiama direttamente, come farebbe un
// browser manomesso, e si verifica che cosa arriva al database.

const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] as unknown[], rowCount: 0 }));
vi.mock('@/lib/db', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

const richiediAccessoSchema = vi.fn(async () => ({
  modalita: 'ADMIN_SPAZIO' as const,
  email: 'anna@alfa.it',
}));
vi.mock('@/lib/autorizzazione', () => ({ richiediAccessoSchema }));

// Il DDL del tenant non serve qui: le azioni validano prima di toccare le
// tabelle, e comunque nessuna tabella vera deve essere creata.
vi.mock('@/db/provision', () => ({
  assicuraTabellaCategorieTipoDebito: async () => {},
  assicuraTabelleTl: async () => {},
  assicuraTabellaLavorazioniTipoDebito: async () => {},
}));

const { collegaCategoriaTlAction, scollegaCategoriaTlAction } =
  await import('./lavorazioniTipoDebito');

const SCHEMA = 'tenant_alfa';
const unaRiga = { rows: [{ ok: 1 }], rowCount: 1 };

const scritte = () =>
  query.mock.calls.filter((c) => /^\s*(INSERT|UPDATE|DELETE)/i.test(String(c[0])));

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  richiediAccessoSchema.mockClear();
});

describe('collegamento categoria → TS', () => {
  it('una categoria che non esiste non viene collegata', async () => {
    const esito = await collegaCategoriaTlAction(SCHEMA, 'INVENTATA', 12);

    expect(esito.success).toBe(false);
    expect(esito.error).toContain('non riconosciuta');
    expect(scritte()).toHaveLength(0);
    // La guardia di accesso resta la prima istruzione: nessuna azione parte
    // senza sapere chi la chiama.
    expect(richiediAccessoSchema).toHaveBeenCalledWith(SCHEMA, { soloAdmin: true });
  });

  it('una TS che non è nel catalogo non viene collegata', async () => {
    // Prima la categoria esiste, poi la TS no.
    query.mockResolvedValueOnce(unaRiga);

    const esito = await collegaCategoriaTlAction(SCHEMA, 'DEBITO', 999);

    expect(esito.success).toBe(false);
    expect(esito.error).toBe('TS non trovata nel catalogo.');
    expect(scritte()).toHaveLength(0);
  });

  it('un id non intero viene rifiutato prima di qualunque lettura', async () => {
    const esito = await collegaCategoriaTlAction(SCHEMA, 'DEBITO', 0);

    expect(esito.success).toBe(false);
    expect(esito.error).toBe('TS non valida.');
    expect(query).not.toHaveBeenCalled();
  });

  it('il collegamento si scrive su `categoria_tl` con la coppia categoria + TS', async () => {
    query.mockResolvedValue(unaRiga);

    const esito = await collegaCategoriaTlAction(SCHEMA, ' DEBITO ', 12);

    expect(esito.success).toBe(true);
    const insert = scritte();
    expect(insert).toHaveLength(1);
    expect(String(insert[0][0])).toContain('categoria_tl');
    expect(String(insert[0][0])).toContain('ON CONFLICT');
    expect(insert[0][1]).toEqual(['DEBITO', 12]);
  });
});

describe('scollegamento categoria → TS', () => {
  it('senza righe da cancellare risponde con l’errore, non con un finto successo', async () => {
    const esito = await scollegaCategoriaTlAction(SCHEMA, 'DEBITO', 7);

    expect(esito.success).toBe(false);
    expect(esito.error).toBe('Collegamento non trovato.');
  });

  it('cancella la coppia indicata e nient’altro', async () => {
    query.mockResolvedValueOnce(unaRiga);

    const esito = await scollegaCategoriaTlAction(SCHEMA, 'DEBITO', 7);

    expect(esito.success).toBe(true);
    const cancellazioni = scritte();
    expect(cancellazioni).toHaveLength(1);
    expect(String(cancellazioni[0][0])).toContain('DELETE FROM');
    expect(cancellazioni[0][1]).toEqual(['DEBITO', 7]);
  });

  it('uno schema non valido non arriva al database', async () => {
    const esito = await scollegaCategoriaTlAction('tenant-alfa; DROP', 'DEBITO', 7);

    expect(esito.success).toBe(false);
    expect(esito.error).toBe('Nome schema non valido.');
    expect(query).not.toHaveBeenCalled();
  });
});
