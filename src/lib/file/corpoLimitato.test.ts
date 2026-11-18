import { describe, expect, it } from 'vitest';
import { CorpoTroppoGrande, formDataDalCorpo, leggiCorpoLimitato } from './corpoLimitato';

/** Una richiesta con il corpo a pezzi e nessun `Content-Length` (chunked). */
function richiestaChunked(byte: Uint8Array, pezzi = 4): Request {
  const flusso = new ReadableStream<Uint8Array>({
    start(controller) {
      const passo = Math.max(1, Math.ceil(byte.byteLength / pezzi));
      for (let i = 0; i < byte.byteLength; i += passo) {
        controller.enqueue(byte.subarray(i, Math.min(i + passo, byte.byteLength)));
      }
      controller.close();
    },
  });
  return new Request('http://locale/prova', {
    method: 'POST',
    // `duplex` serve a undici per accettare uno stream come corpo.
    body: flusso,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('leggiCorpoLimitato', () => {
  it('legge un corpo a pezzi senza Content-Length', async () => {
    const originale = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const richiesta = richiestaChunked(originale, 3);
    expect(richiesta.headers.get('content-length')).toBeNull();
    const letto = await leggiCorpoLimitato(richiesta, 1024);
    expect(Array.from(letto)).toEqual(Array.from(originale));
  });

  it('si ferma appena il corpo supera il tetto, senza Content-Length', async () => {
    const richiesta = richiestaChunked(new Uint8Array(4096), 8);
    await expect(leggiCorpoLimitato(richiesta, 1024)).rejects.toBeInstanceOf(CorpoTroppoGrande);
  });

  it('rifiuta subito un Content-Length oltre il tetto', async () => {
    const richiesta = new Request('http://locale/prova', {
      method: 'POST',
      headers: { 'content-length': '999999' },
    });
    await expect(leggiCorpoLimitato(richiesta, 1024)).rejects.toBeInstanceOf(CorpoTroppoGrande);
  });

  it('un corpo vuoto non è un errore: è un array vuoto', async () => {
    const richiesta = new Request('http://locale/prova', { method: 'POST' });
    expect((await leggiCorpoLimitato(richiesta, 1024)).byteLength).toBe(0);
  });

  it('il multipart letto si ricostruisce con il suo Content-Type', async () => {
    const modulo = new FormData();
    modulo.append('codice', 'SPAZIO-1');
    modulo.append('file', new Blob([new TextEncoder().encode('%PDF-1.7 demo')]), 'visura.pdf');
    const risposta = new Response(modulo);
    const tipo = risposta.headers.get('content-type');
    const byte = new Uint8Array(await risposta.arrayBuffer());

    const letto = await leggiCorpoLimitato(
      new Request('http://locale/prova', {
        method: 'POST',
        body: byte,
        headers: { 'content-type': tipo! },
      }),
      1024 * 1024
    );
    const ricostruito = await formDataDalCorpo(letto, tipo);
    expect(ricostruito.get('codice')).toBe('SPAZIO-1');
    const file = ricostruito.get('file') as File;
    expect(file.name).toBe('visura.pdf');
    expect(await file.text()).toBe('%PDF-1.7 demo');
  });
});
