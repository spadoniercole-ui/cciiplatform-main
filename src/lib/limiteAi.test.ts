import { describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { consumaQuotaAi, limitiAi, rimborsaQuotaAi, type Esecutore } from './limiteAi';

const pg = await PGlite.create();
const db: Esecutore = { query: (t, p) => pg.query(t, p) };
const env = (v: Record<string, string>) => v as NodeJS.ProcessEnv;

describe('limitiAi', () => {
  it('valori predefiniti e sovrascrittura da ambiente', () => {
    expect(limitiAi('VISURA', env({}))).toEqual({ perUtenteOra: 30, perSpazioGiorno: 300 });
    expect(
      limitiAi('VISURA', env({ AI_VISURE_PER_UTENTE_ORA: '5', AI_VISURE_PER_SPAZIO_GIORNO: '50' }))
    ).toEqual({ perUtenteOra: 5, perSpazioGiorno: 50 });
    // Valori non validi: si tiene il predefinito.
    expect(limitiAi('VISURA', env({ AI_VISURE_PER_UTENTE_ORA: '0' })).perUtenteOra).toBe(30);
    expect(limitiAi('VISURA', env({ AI_VISURE_PER_UTENTE_ORA: 'abc' })).perUtenteOra).toBe(30);
  });

  it('i riscontri sulle fonti hanno un tetto proprio', () => {
    expect(limitiAi('RISCONTRO', env({}))).toEqual({ perUtenteOra: 60, perSpazioGiorno: 600 });
    expect(limitiAi('RISCONTRO', env({ AI_RISCONTRI_PER_UTENTE_ORA: '3' })).perUtenteOra).toBe(3);
  });
});

describe('consumaQuotaAi', () => {
  it("blocca l'utente oltre il limite orario, senza toccare gli altri", async () => {
    const e = env({ AI_VISURE_PER_UTENTE_ORA: '3', AI_VISURE_PER_SPAZIO_GIORNO: '100' });
    for (let i = 0; i < 3; i++) {
      expect(
        (await consumaQuotaAi(db, 'VISURA', { utente: 'mario', spazioId: 1 }, e)).consentito
      ).toBe(true);
    }
    const oltre = await consumaQuotaAi(db, 'VISURA', { utente: 'mario', spazioId: 1 }, e);
    expect(oltre.consentito).toBe(false);
    expect(oltre.error).toMatch(/3 estrazioni automatiche all'ora/);
    expect(
      (await consumaQuotaAi(db, 'VISURA', { utente: 'anna', spazioId: 1 }, e)).consentito
    ).toBe(true);
  });

  it('blocca lo spazio oltre il limite giornaliero complessivo', async () => {
    const e = env({ AI_VISURE_PER_UTENTE_ORA: '100', AI_VISURE_PER_SPAZIO_GIORNO: '4' });
    const esiti = [];
    for (const utente of ['a', 'b', 'c', 'd', 'e']) {
      esiti.push(await consumaQuotaAi(db, 'VISURA', { utente, spazioId: 2 }, e));
    }
    expect(esiti.map((x) => x.consentito)).toEqual([true, true, true, true, false]);
    expect(esiti[4].error).toMatch(/giornaliero di 4/);
    // Un altro spazio non ne risente.
    expect((await consumaQuotaAi(db, 'VISURA', { utente: 'a', spazioId: 3 }, e)).consentito).toBe(
      true
    );
  });

  it('Superadmin (senza spazio): solo il limite per utente', async () => {
    const e = env({ AI_VISURE_PER_UTENTE_ORA: '2' });
    const chi = { utente: 'superadmin', spazioId: null };
    expect((await consumaQuotaAi(db, 'VISURA', chi, e)).consentito).toBe(true);
    expect((await consumaQuotaAi(db, 'VISURA', chi, e)).consentito).toBe(true);
    expect((await consumaQuotaAi(db, 'VISURA', chi, e)).consentito).toBe(false);
  });

  it('il tetto delle elaborazioni del piano ha i suoi contatori', async () => {
    expect(limitiAi('PIANO', env({}))).toEqual({ perUtenteOra: 10, perSpazioGiorno: 60 });
    const e = env({ AI_PIANI_PER_UTENTE_ORA: '2', AI_PIANI_PER_SPAZIO_GIORNO: '100' });
    expect((await consumaQuotaAi(db, 'PIANO', { utente: 'luca', spazioId: 5 }, e)).consentito).toBe(
      true
    );
    expect((await consumaQuotaAi(db, 'PIANO', { utente: 'luca', spazioId: 5 }, e)).consentito).toBe(
      true
    );
    const oltre = await consumaQuotaAi(db, 'PIANO', { utente: 'luca', spazioId: 5 }, e);
    expect(oltre.consentito).toBe(false);
    // Il messaggio dice che cosa si è fermato e che cosa resta all'operatore.
    expect(oltre.error).toContain("Limite di 2 elaborazioni del piano all'ora raggiunto.");
    expect(oltre.error).toContain('il piano in schermo resta quello salvato');
    // I contatori delle visure non ne risentono.
    expect(
      (await consumaQuotaAi(db, 'VISURA', { utente: 'luca', spazioId: 5 }, e)).consentito
    ).toBe(true);
  });

  it('il messaggio del tetto dice quale lavoro si è fermato', async () => {
    const e = env({ AI_RISCONTRI_PER_UTENTE_ORA: '1', AI_RISCONTRI_PER_SPAZIO_GIORNO: '100' });
    expect(
      (await consumaQuotaAi(db, 'RISCONTRO', { utente: 'sara', spazioId: 4 }, e)).consentito
    ).toBe(true);
    const oltre = await consumaQuotaAi(db, 'RISCONTRO', { utente: 'sara', spazioId: 4 }, e);
    expect(oltre.consentito).toBe(false);
    expect(oltre.error).toMatch(/1 verifiche sulle fonti all'ora/);
    // I contatori delle visure non ne risentono.
    expect(
      (await consumaQuotaAi(db, 'VISURA', { utente: 'sara', spazioId: 4 }, e)).consentito
    ).toBe(true);
  });

  it('un tentativo rifiutato non consuma la quota, e il rimborso la restituisce', async () => {
    const e = env({ AI_VISURE_PER_UTENTE_ORA: '2', AI_VISURE_PER_SPAZIO_GIORNO: '100' });
    const chi = { utente: 'elsa', spazioId: 6 };
    expect((await consumaQuotaAi(db, 'VISURA', chi, e)).consentito).toBe(true);
    expect((await consumaQuotaAi(db, 'VISURA', chi, e)).consentito).toBe(true);
    // Tre tentativi negati di fila: il contatore non sale, quindi il tetto
    // resta al suo posto invece di allontanarsi a ogni clic.
    for (let i = 0; i < 3; i++)
      expect((await consumaQuotaAi(db, 'VISURA', chi, e)).consentito).toBe(false);
    await rimborsaQuotaAi(db, 'VISURA', chi);
    // Restituita una delle due: si può chiamare ancora una volta.
    expect((await consumaQuotaAi(db, 'VISURA', chi, e)).consentito).toBe(true);
    expect((await consumaQuotaAi(db, 'VISURA', chi, e)).consentito).toBe(false);
  });

  it('il rimborso non porta il contatore sotto zero', async () => {
    const e = env({ AI_VISURE_PER_UTENTE_ORA: '100', AI_VISURE_PER_SPAZIO_GIORNO: '100' });
    const chi = { utente: 'nessuno', spazioId: 7 };
    await rimborsaQuotaAi(db, 'VISURA', chi);
    await rimborsaQuotaAi(db, 'VISURA', chi);
    expect((await consumaQuotaAi(db, 'VISURA', chi, e)).consentito).toBe(true);
  });

  it('con il database irraggiungibile la chiamata è consentita', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rotto: Esecutore = { query: async () => Promise.reject(new Error('giù')) };
    expect((await consumaQuotaAi(rotto, 'VISURA', { utente: 'x', spazioId: 1 })).consentito).toBe(
      true
    );
  });
});
