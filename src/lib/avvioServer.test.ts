import { describe, expect, it, vi } from 'vitest';
import { conRiprova } from './avvioServer';

describe('conRiprova', () => {
  const senzaAttesa = async () => {};

  it('riprova finché il database risponde', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let chiamate = 0;
    const esito = await conRiprova(
      async () => {
        chiamate++;
        if (chiamate < 3) throw new Error('ECONNREFUSED');
        return 'ok';
      },
      5,
      10,
      senzaAttesa
    );
    expect(esito).toBe('ok');
    expect(chiamate).toBe(3);
  });

  it("dopo l'ultimo tentativo rilancia l'errore", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const attese: number[] = [];
    await expect(
      conRiprova(
        async () => {
          throw new Error('giù');
        },
        3,
        50,
        async (ms) => {
          attese.push(ms);
        }
      )
    ).rejects.toThrow('giù');
    expect(attese).toEqual([50, 50]);
  });
});
