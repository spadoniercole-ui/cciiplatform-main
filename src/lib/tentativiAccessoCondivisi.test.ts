import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { azzeraTentativi, MAX_TENTATIVI, MINUTI_BLOCCO } from './tentativiAccesso';
import {
  azzeraTentativiCondivisi,
  controllaTentativiCondivisi,
  messaggioBlocco,
  registraFallimentoCondiviso,
  type Esecutore,
} from './tentativiAccessoCondivisi';

// Su un Postgres vero (PGlite). "Un'altra istanza" = stesso database, memoria
// di processo vuota: la si simula azzerando il solo contatore in memoria.
const pg = await PGlite.create();
const db: Esecutore = { query: (t, p) => pg.query(t, p) };
const altraIstanza = (chiave: string) => azzeraTentativi(chiave);

describe('limite dei tentativi condiviso', () => {
  beforeEach(async () => {
    await azzeraTentativiCondivisi(db, 'USER:mario.rossi');
  });

  it('il blocco vale anche per le altre istanze (e dopo un riavvio)', async () => {
    let esito = { bloccato: false } as Awaited<ReturnType<typeof registraFallimentoCondiviso>>;
    for (let i = 0; i < MAX_TENTATIVI; i++) {
      esito = await registraFallimentoCondiviso(db, 'USER:mario.rossi');
    }
    expect(esito.bloccato).toBe(true);

    altraIstanza('USER:mario.rossi');
    const controllo = await controllaTentativiCondivisi(db, 'USER:mario.rossi');
    expect(controllo.bloccato).toBe(true);
    expect(controllo.secondiRimanenti).toBeGreaterThan(MINUTI_BLOCCO * 60 - 5);
  });

  it('i fallimenti si sommano tra istanze diverse', async () => {
    for (let i = 0; i < MAX_TENTATIVI - 1; i++) {
      await registraFallimentoCondiviso(db, 'USER:mario.rossi');
      altraIstanza('USER:mario.rossi'); // ogni tentativo su un'istanza nuova
    }
    expect((await controllaTentativiCondivisi(db, 'USER:mario.rossi')).bloccato).toBe(false);
    const ultimo = await registraFallimentoCondiviso(db, 'USER:mario.rossi');
    expect(ultimo.bloccato).toBe(true);
  });

  it('un accesso riuscito azzera il conteggio', async () => {
    for (let i = 0; i < MAX_TENTATIVI - 1; i++) {
      await registraFallimentoCondiviso(db, 'USER:mario.rossi');
    }
    await azzeraTentativiCondivisi(db, 'USER:mario.rossi');
    const e = await registraFallimentoCondiviso(db, 'USER:mario.rossi');
    expect(e.bloccato).toBe(false);
  });

  it('a blocco scaduto si riparte da capo', async () => {
    for (let i = 0; i < MAX_TENTATIVI; i++) {
      await registraFallimentoCondiviso(db, 'USER:mario.rossi');
    }
    await pg.query(
      `UPDATE public.tentativi_accesso SET bloccato_fino = now() - interval '1 second'
        WHERE chiave = 'USER:mario.rossi'`
    );
    altraIstanza('USER:mario.rossi');
    expect((await controllaTentativiCondivisi(db, 'USER:mario.rossi')).bloccato).toBe(false);
    const e = await registraFallimentoCondiviso(db, 'USER:mario.rossi');
    expect(e.bloccato).toBe(false);
    const r = await pg.query<{ fallimenti: number }>(
      `SELECT fallimenti FROM public.tentativi_accesso WHERE chiave = 'USER:mario.rossi'`
    );
    expect(r.rows[0].fallimenti).toBe(1);
  });

  it('chiavi diverse non si influenzano', async () => {
    for (let i = 0; i < MAX_TENTATIVI; i++) {
      await registraFallimentoCondiviso(db, 'USER:mario.rossi');
    }
    expect((await controllaTentativiCondivisi(db, 'USER:anna.bianchi')).bloccato).toBe(false);
  });

  it('con il database irraggiungibile vale il limite in memoria', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rotto: Esecutore = { query: async () => Promise.reject(new Error('ECONNREFUSED')) };
    azzeraTentativi('USER:x');
    let e = await registraFallimentoCondiviso(rotto, 'USER:x');
    expect(e.bloccato).toBe(false);
    for (let i = 1; i < MAX_TENTATIVI; i++) e = await registraFallimentoCondiviso(rotto, 'USER:x');
    expect(e.bloccato).toBe(true);
    expect((await controllaTentativiCondivisi(rotto, 'USER:x')).bloccato).toBe(true);
    azzeraTentativi('USER:x');
  });

  it('messaggio di blocco', () => {
    expect(messaggioBlocco(60)).toBe('Troppi tentativi falliti. Riprovare fra 1 minuto.');
    expect(messaggioBlocco(900)).toBe('Troppi tentativi falliti. Riprovare fra 15 minuti.');
    expect(messaggioBlocco(0)).toBe('Troppi tentativi falliti. Riprovare fra 1 minuto.');
  });
});
