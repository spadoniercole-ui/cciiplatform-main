// src/lib/serviziEsterni/crediti.ts
//
// LO STATO DEI SERVIZI A PAGAMENTO, LETTO DALLE LORO RISPOSTE (0.245.0).
//
// La piattaforma chiama servizi che costano: l'API di Anthropic per le funzioni
// AI, GitHub per verificare la consegna, Vercel Blob per i file. Quando una di
// queste smette di rispondere, l'errore arriva all'utente come «servizio non
// disponibile» — e chi gestisce il prodotto non sa se manca la chiave, se è
// stato superato il limite di richieste o se il credito è finito. Sono tre
// situazioni diverse, con tre rimedi diversi.
//
// Qui la classificazione è pura: entra lo stato HTTP con il corpo, esce una
// lettura con il rimedio. La chiamata di rete la fa l'azione del Superadmin.
//
// REGOLA GENERALE: un servizio che non si può interrogare non è «verde». Si
// dichiara «non raggiungibile» e il pannello lo mostra come tale, perché un
// credito non verificato non è un credito disponibile.

/** Come sta un servizio a pagamento. */
export type StatoCredito =
  | 'OK'
  | 'NON_CONFIGURATO'
  | 'CREDITO_ESAURITO'
  | 'CREDENZIALE_NON_VALIDA'
  | 'LIMITE_RAGGIUNGIMENTO'
  | 'NON_RAGGIUNGIBILE';

export interface LetturaCredito {
  stato: StatoCredito;
  dettaglio: string;
  /** Che cosa deve fare chi gestisce il prodotto. */
  rimedio: string;
}

const RIMEDIO_CHIAVE = 'Imposta la variabile fra i secret del progetto e ridistribuisci.';
const RIMEDIO_CREDITO =
  'Ricarica il credito sul conto del fornitore: finché è esaurito ogni funzione che lo usa risponde «non disponibile».';
const RIMEDIO_LIMITE =
  'Attendi il rinnovo della finestra (la data è nel dettaglio). Se succede spesso, alza il tetto o distribuisci le chiamate.';

/**
 * Una risposta dell'API di Anthropic.
 *
 * 401 è la chiave sbagliata o revocata; 403 può essere un permesso mancante;
 * 429 è il limite di richieste; un 400 con un messaggio sul credito è il conto
 * senza fondi — Anthropic lo restituisce così, non con 402.
 */
export function leggiAnthropic(statoHttp: number, corpo: string): LetturaCredito {
  const testo = (corpo || '').toLowerCase();
  if (statoHttp >= 200 && statoHttp < 300) {
    return {
      stato: 'OK',
      dettaglio: 'La chiave risponde all’API.',
      rimedio: 'Nessuna azione: il servizio è raggiungibile e autenticato.',
    };
  }
  if (statoHttp === 401) {
    return {
      stato: 'CREDENZIALE_NON_VALIDA',
      dettaglio: 'La chiave è stata rifiutata (401).',
      rimedio: 'Rigenera la chiave nella console del fornitore e aggiorna il secret.',
    };
  }
  if (statoHttp === 402 || /credit|balance|billing|fund/i.test(testo)) {
    return {
      stato: 'CREDITO_ESAURITO',
      dettaglio: 'Il fornitore rifiuta la chiamata per credito insufficiente.',
      rimedio: RIMEDIO_CREDITO,
    };
  }
  if (statoHttp === 403) {
    return {
      stato: 'CREDENZIALE_NON_VALIDA',
      dettaglio: 'La chiave non ha i permessi necessari (403).',
      rimedio: 'Verifica i permessi della chiave nella console del fornitore.',
    };
  }
  if (statoHttp === 429) {
    return {
      stato: 'LIMITE_RAGGIUNGIMENTO',
      dettaglio: 'Limite di richieste raggiunto (429).',
      rimedio: RIMEDIO_LIMITE,
    };
  }
  return {
    stato: 'NON_RAGGIUNGIBILE',
    dettaglio: `Risposta inattesa dal fornitore (${statoHttp}).`,
    rimedio: 'Riprova fra qualche minuto; se persiste, controlla lo stato del servizio.',
  };
}

/** Il corpo di `GET /rate_limit` di GitHub. */
export interface RateLimitGitHub {
  remaining: number;
  limit: number;
  /** Secondi epoch del rinnovo. */
  reset: number;
}

/** Estrae il conteggio delle richieste dal `rate_limit` di GitHub. */
export function leggiRateLimitGitHub(json: unknown): RateLimitGitHub | null {
  const core = (json as { resources?: { core?: Record<string, unknown> } })?.resources?.core;
  if (!core) return null;
  const remaining = Number(core.remaining);
  const limit = Number(core.limit);
  const reset = Number(core.reset);
  if (!Number.isFinite(remaining) || !Number.isFinite(limit) || !Number.isFinite(reset)) {
    return null;
  }
  return { remaining, limit, reset };
}

/**
 * Quante richieste restano a GitHub per l'ora corrente.
 *
 * Senza token il tetto è 60 l'ora: una consegna completa ne consuma una
 * ventina, e due tentativi ravvicinati lo esauriscono. Il pannello lo dice
 * prima che l'utente si trovi davanti a un 403.
 */
export function leggiGitHub(
  json: unknown,
  haToken: boolean,
  adessoMs: number = Date.now()
): LetturaCredito {
  const r = leggiRateLimitGitHub(json);
  if (!r) {
    return {
      stato: 'NON_RAGGIUNGIBILE',
      dettaglio: 'La risposta di GitHub non contiene il conteggio delle richieste.',
      rimedio: 'Riprova fra qualche minuto.',
    };
  }
  const rinnovo = new Date(r.reset * 1000).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const quando = r.reset * 1000 > adessoMs ? `rinnovo alle ${rinnovo}` : 'rinnovo immediato';
  if (r.remaining <= 0) {
    return {
      stato: 'LIMITE_RAGGIUNGIMENTO',
      dettaglio: `Nessuna richiesta disponibile su ${r.limit} (${quando}).`,
      rimedio: haToken
        ? 'Attendi il rinnovo: la consegna riprenderà da sola.'
        : 'Aggiungi GH_TOKEN fra i secret: senza token il tetto è di 60 richieste l’ora.',
    };
  }
  return {
    stato: 'OK',
    dettaglio: `${r.remaining} richieste su ${r.limit} (${quando}).`,
    rimedio: haToken
      ? 'Nessuna azione.'
      : 'Con GH_TOKEN il tetto sale a 5.000 richieste l’ora: oggi sono 60.',
  };
}

/** Il verdetto per una chiave che non è stata configurata affatto. */
export function servizioNonConfigurato(nomeChiave: string): LetturaCredito {
  return {
    stato: 'NON_CONFIGURATO',
    dettaglio: `La variabile ${nomeChiave} non è impostata.`,
    rimedio: `${RIMEDIO_CHIAVE} Senza, le funzioni che la usano restano spente.`,
  };
}

export const ETICHETTA_STATO: Record<StatoCredito, string> = {
  OK: 'Disponibile',
  NON_CONFIGURATO: 'Non configurato',
  CREDITO_ESAURITO: 'Credito esaurito',
  CREDENZIALE_NON_VALIDA: 'Chiave non valida',
  LIMITE_RAGGIUNGIMENTO: 'Limite raggiunto',
  NON_RAGGIUNGIBILE: 'Non raggiungibile',
};
