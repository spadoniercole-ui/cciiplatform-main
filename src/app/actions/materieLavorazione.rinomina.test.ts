import { beforeEach, describe, expect, it, vi } from 'vitest';

// LA RINOMINA IN BLOCCO DEI PRODOTTI IMPORTATI (0.158.0).
//
// La copia dalle vecchie lavorazioni delle materie ha messo il nome della
// lavorazione anche come prodotto: la scheda delle direttrici li elenca e offre
// questo comando. Le prove sono sul database finto — l'ordine delle query conta,
// perché prima si cerca il doppione e solo dopo si rinomina.

const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] as unknown[], rowCount: 0 }));
vi.mock('@/lib/db', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

const richiediAccessoSchema = vi.fn(async () => ({
  modalita: 'ADMIN_SPAZIO' as const,
  email: 'anna@alfa.it',
}));
vi.mock('@/lib/autorizzazione', () => ({ richiediAccessoSchema }));

vi.mock('@/db/provision', () => ({
  assicuraTabelleProdottiTl: async () => {},
  assicuraTabelleParametriSpazio: async () => {},
}));

const { rinominaProdottoTlAction } = await import('./materieLavorazione');

const SCHEMA = 'tenant_alfa';

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  richiediAccessoSchema.mockClear();
});

describe('rinomina in blocco del prodotto delle TL', () => {
  it('un nome nuovo uguale al vecchio non tocca il database', async () => {
    const esito = await rinominaProdottoTlAction(SCHEMA, 'Ufficio Entrate', 'DURC', ' durc ');

    expect(esito.success).toBe(false);
    expect(esito.error).toBe('Il nome nuovo è uguale a quello attuale.');
    expect(query).not.toHaveBeenCalled();
  });

  it('senza direttrice non si rinomina niente', async () => {
    const esito = await rinominaProdottoTlAction(SCHEMA, '   ', 'DURC', 'DURC 2024');

    expect(esito.success).toBe(false);
    expect(esito.error).toBe('Indica la direttrice.');
    expect(query).not.toHaveBeenCalled();
  });

  it('se il prodotto di destinazione ha già la stessa lavorazione, si ferma prima di rinominare', async () => {
    query.mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 });

    const esito = await rinominaProdottoTlAction(SCHEMA, 'Ufficio Entrate', 'DURC', 'DURC 2024');

    expect(esito.success).toBe(false);
    expect(esito.error).toContain('stessa lavorazione');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rinomina tutte le TL del prodotto e dice quante', async () => {
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 });

    const esito = await rinominaProdottoTlAction(SCHEMA, 'Ufficio Entrate', 'DURC', 'DURC 2024');

    expect(esito.success).toBe(true);
    expect(esito.rinominati).toBe(3);
    const aggiornamento = query.mock.calls[1];
    expect(String(aggiornamento[0])).toContain('UPDATE');
    expect(aggiornamento[1]).toEqual(['Ufficio Entrate', 'DURC', 'DURC 2024']);
  });

  it('un prodotto senza TL risponde con l’errore invece di un finto successo', async () => {
    const esito = await rinominaProdottoTlAction(SCHEMA, 'Ufficio Entrate', 'DURC', 'DURC 2024');

    expect(esito.success).toBe(false);
    expect(esito.error).toBe('Nessuna TL trovata su quel prodotto.');
  });
});
