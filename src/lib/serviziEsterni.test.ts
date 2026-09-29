import { describe, expect, it } from 'vitest';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { erroreServizioEsterno, messaggioChiaveAiMancante } from './serviziEsterni';

function erroreNode(code: string, message = `connect ${code}`): Error {
  return Object.assign(new Error(message), { code });
}

function fetchFallita(causa: unknown): TypeError {
  return new TypeError('fetch failed', { cause: causa });
}

describe('erroreServizioEsterno — connessione assente', () => {
  it('APIConnectionError dello SDK Anthropic', () => {
    const e = new APIConnectionError({ cause: fetchFallita(erroreNode('ENOTFOUND')) });
    const msg = erroreServizioEsterno(e, 'AI');
    expect(msg).toContain('Funzione AI non disponibile');
    expect(msg).toContain('non riesce a raggiungere Internet (servizio Anthropic)');
    expect(msg).toContain('Le altre funzioni della piattaforma funzionano normalmente');
  });

  it('APIConnectionTimeoutError dello SDK Anthropic', () => {
    const msg = erroreServizioEsterno(new APIConnectionTimeoutError(), 'AI');
    expect(msg).toContain('non ha risposto in tempo');
  });

  it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET'])(
    'fetch failed con causa %s (ISTAT)',
    (codice) => {
      expect(erroreServizioEsterno(fetchFallita(erroreNode(codice)), 'ISTAT')).toBe(
        'Dati di settore non disponibili: il server non riesce a raggiungere Internet (ISTAT).'
      );
    }
  );

  it.each(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'])('fetch failed con causa %s → timeout', (c) => {
    expect(erroreServizioEsterno(fetchFallita(erroreNode(c)), 'ISTAT')).toContain(
      'ISTAT non ha risposto in tempo'
    );
  });

  it('errore di rete diretto (codice sul primo livello)', () => {
    expect(erroreServizioEsterno(erroreNode('ECONNREFUSED'), 'AI')).toContain(
      'raggiungere Internet'
    );
  });

  it('"fetch failed" senza causa', () => {
    expect(erroreServizioEsterno(new TypeError('fetch failed'), 'ISTAT')).toContain(
      'raggiungere Internet (ISTAT)'
    );
  });

  it('causa annidata su più livelli e AggregateError', () => {
    const aggregato = new AggregateError([erroreNode('ECONNREFUSED')], 'connessione fallita');
    const e = new APIConnectionError({ cause: fetchFallita(aggregato) });
    expect(erroreServizioEsterno(e, 'AI')).toContain('raggiungere Internet');
    expect(erroreServizioEsterno(fetchFallita(aggregato), 'ISTAT')).toContain(
      'raggiungere Internet (ISTAT)'
    );
  });

  it('timeout di fetch con AbortSignal.timeout (TimeoutError)', () => {
    const e = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    expect(erroreServizioEsterno(e, 'ISTAT')).toContain('non ha risposto in tempo');
  });

  it('oggetti con la stessa forma degli errori SDK (nome, senza istanza)', () => {
    const e = Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' });
    expect(erroreServizioEsterno(e, 'AI')).toContain('raggiungere Internet');
  });
});

describe('erroreServizioEsterno — chiave e sovraccarico', () => {
  it('AuthenticationError (401) → chiave non valida', () => {
    const e = new AuthenticationError(
      401,
      { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
      undefined,
      new Headers()
    );
    const msg = erroreServizioEsterno(e, 'AI');
    expect(msg).toContain('chiave API Anthropic non è valida');
    expect(msg).toContain('apikey.txt');
  });

  it('oggetto con status 401', () => {
    expect(erroreServizioEsterno({ status: 401, message: 'x' }, 'AI')).toContain('non è valida');
  });

  it('RateLimitError (429) → sovraccarico', () => {
    const e = new RateLimitError(429, undefined, 'rate limit', new Headers());
    expect(erroreServizioEsterno(e, 'AI')).toBe(
      'Servizio AI momentaneamente sovraccarico, riprova tra qualche minuto.'
    );
  });

  it('Overloaded (529) → sovraccarico', () => {
    const e = APIError.generate(
      529,
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
      undefined,
      new Headers()
    );
    expect(e).toBeInstanceOf(InternalServerError);
    expect(erroreServizioEsterno(e, 'AI')).toContain('sovraccarico');
  });

  it('per ISTAT il 401 non produce un messaggio di chiave', () => {
    expect(erroreServizioEsterno({ status: 401 }, 'ISTAT')).toBeNull();
  });
});

describe('erroreServizioEsterno — altri errori restano invariati', () => {
  it.each([
    ['errore generico', new Error('qualcosa è andato storto')],
    ['BadRequestError', new BadRequestError(400, undefined, 'prompt troppo lungo', new Headers())],
    ['InternalServerError 500', new InternalServerError(500, undefined, 'boom', new Headers())],
    ['annullamento utente', new APIUserAbortError()],
    ['stringa', 'errore'],
    ['null', null],
    ['undefined', undefined],
  ])('%s → null', (_nome, e) => {
    expect(erroreServizioEsterno(e, 'AI')).toBeNull();
    expect(erroreServizioEsterno(e, 'ISTAT')).toBeNull();
  });
});

describe('messaggioChiaveAiMancante', () => {
  it('cita la variabile e il file apikey.txt della portable', () => {
    const msg = messaggioChiaveAiMancante();
    expect(msg).toContain('ANTHROPIC_API_KEY');
    expect(msg).toContain('apikey.txt');
    expect(msg).toContain('portable');
  });
});
