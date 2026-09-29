// src/lib/serviziEsterni.ts
//
// Messaggi chiari in italiano quando un servizio esterno (Anthropic per le
// funzioni AI, ISTAT per i dati di settore) non è raggiungibile. Serve
// soprattutto all'edizione portable, che può girare in una rete locale senza
// Internet o senza chiave API: invece dell'errore tecnico ("fetch failed",
// "Connection error.", "getaddrinfo ENOTFOUND…") l'utente legge cosa succede.
// Se il servizio funziona, o l'errore è di altro tipo, si restituisce null e
// il chiamante mantiene il messaggio di sempre.

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  RateLimitError,
} from '@anthropic-ai/sdk';

export type ServizioEsterno = 'AI' | 'ISTAT';

/** Codici di errore di rete di Node/undici che indicano un servizio irraggiungibile. */
const CODICI_RETE = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const MESSAGGI = {
  AI: {
    offline:
      'Funzione AI non disponibile: il server non riesce a raggiungere Internet (servizio Anthropic). Le altre funzioni della piattaforma funzionano normalmente.',
    timeout:
      'Funzione AI non disponibile: il servizio Anthropic non ha risposto in tempo (connessione a Internet assente o troppo lenta). Riprova più tardi; le altre funzioni della piattaforma funzionano normalmente.',
    chiave:
      "Funzione AI non disponibile: la chiave API Anthropic non è valida o è stata revocata. Verificare la chiave configurata sul server (nell'edizione portable, il file apikey.txt).",
    sovraccarico: 'Servizio AI momentaneamente sovraccarico, riprova tra qualche minuto.',
  },
  ISTAT: {
    offline:
      'Dati di settore non disponibili: il server non riesce a raggiungere Internet (ISTAT).',
    timeout:
      'Dati di settore non disponibili: ISTAT non ha risposto in tempo (connessione a Internet assente o troppo lenta). Riprova più tardi.',
    chiave: null,
    sovraccarico:
      'Dati di settore momentaneamente non disponibili: il servizio ISTAT è sovraccarico, riprova tra qualche minuto.',
  },
} as const;

/** Messaggio unico per la chiave ANTHROPIC_API_KEY assente. */
export function messaggioChiaveAiMancante(): string {
  return "Funzione AI non disponibile: la chiave API Anthropic (ANTHROPIC_API_KEY) non è configurata sul server. Nell'edizione portable, inserire la chiave nel file apikey.txt accanto al programma di avvio e riavviare. Le altre funzioni della piattaforma funzionano normalmente.";
}

type Categoria = 'offline' | 'timeout' | 'chiave' | 'sovraccarico';

function nomeClasse(e: object): string {
  const nome = (e as { name?: unknown }).name;
  const costruttore = (e as { constructor?: { name?: unknown } }).constructor?.name;
  return `${typeof nome === 'string' ? nome : ''}|${typeof costruttore === 'string' ? costruttore : ''}`;
}

/** Classifica un singolo livello della catena di errori (senza seguire `cause`). */
function classificaLivello(e: unknown): Categoria | null {
  if (!e || typeof e !== 'object') return null;
  const nomi = nomeClasse(e);

  // L'annullamento voluto dall'utente non è un problema di rete.
  if (e instanceof APIUserAbortError || nomi.includes('APIUserAbortError')) return null;

  if (e instanceof APIConnectionTimeoutError || nomi.includes('APIConnectionTimeoutError')) {
    return 'timeout';
  }
  if (e instanceof APIConnectionError || nomi.includes('APIConnectionError')) return 'offline';

  const status = (e as { status?: unknown }).status;
  if (e instanceof AuthenticationError || nomi.includes('AuthenticationError') || status === 401) {
    return 'chiave';
  }
  if (
    e instanceof RateLimitError ||
    nomi.includes('RateLimitError') ||
    status === 429 ||
    status === 529
  ) {
    return 'sovraccarico';
  }
  if (e instanceof APIError && typeof status === 'number') return null;

  const codice = (e as { code?: unknown }).code;
  if (typeof codice === 'string' && CODICI_RETE.has(codice)) {
    return codice === 'ETIMEDOUT' || codice === 'UND_ERR_CONNECT_TIMEOUT' ? 'timeout' : 'offline';
  }
  // Timeout di fetch con AbortSignal.timeout(): DOMException "TimeoutError".
  if ((e as { name?: unknown }).name === 'TimeoutError') return 'timeout';

  const messaggio = (e as { message?: unknown }).message;
  if (typeof messaggio === 'string' && /^fetch failed$/i.test(messaggio.trim())) return 'offline';
  return null;
}

/** Segue `cause` (e gli `errors` di AggregateError) fino a una profondità limitata. */
function classifica(e: unknown, profondita = 0): Categoria | null {
  if (profondita > 6 || !e || typeof e !== 'object') return null;
  const qui = classificaLivello(e);
  if (qui && qui !== 'offline') return qui;
  let annidata = classifica((e as { cause?: unknown }).cause, profondita + 1);
  const errori = (e as { errors?: unknown }).errors;
  if (!annidata && Array.isArray(errori)) {
    for (const sotto of errori) {
      annidata = classifica(sotto, profondita + 1);
      if (annidata) break;
    }
  }
  // "fetch failed" / "Connection error." sono generici: se la causa dice
  // che si tratta di un timeout, prevale quella.
  if (annidata === 'timeout') return annidata;
  return qui ?? annidata;
}

/**
 * Messaggio comprensibile se `error` è un problema di connessione, di chiave
 * API (solo AI) o di sovraccarico del servizio esterno; null altrimenti.
 */
export function erroreServizioEsterno(error: unknown, servizio: ServizioEsterno): string | null {
  const categoria = classifica(error);
  if (!categoria) return null;
  return MESSAGGI[servizio][categoria];
}
