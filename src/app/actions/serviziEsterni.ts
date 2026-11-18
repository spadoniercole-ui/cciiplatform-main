'use server';

// I SERVIZI A PAGAMENTO, VISTI DAL SUPERADMIN (0.245.0).
//
// Il prodotto dipende da servizi che costano: l'API di Anthropic (tutte le
// funzioni AI), GitHub (la verifica della consegna), Vercel Blob (i file). Se
// una chiave manca, se il credito è finito o se il limite di richieste è
// esaurito, l'utente vede solo «servizio non disponibile» — e chi gestisce il
// prodotto non ha un posto dove leggere che cosa è successo davvero.
//
// Questa azione è quel posto. Non espone mai il valore delle chiavi: dice se
// ci sono, e che cosa risponde il fornitore. La classificazione delle risposte
// è in `src/lib/serviziEsterni/crediti.ts`, con i suoi test.

import { pool } from '@/lib/db';
import { richiediSuperadmin } from '@/lib/autorizzazione';
import {
  leggiAnthropic,
  leggiGitHub,
  servizioNonConfigurato,
  type LetturaCredito,
} from '@/lib/serviziEsterni/crediti';
import type { EsitoServiziEsterni, UsoAi, VoceServizio } from '@/lib/serviziEsterni/tipi';

/** Le chiavi che accendono i servizi a consumo. */
const CHIAVI = {
  anthropic: 'ANTHROPIC_API_KEY',
  github: 'GH_TOKEN',
  blob: 'BLOB_READ_WRITE_TOKEN',
  database: 'DATABASE_URL',
} as const;

const ATTESA_MS = 8000;

/** Chiede il modello più piccolo: basta a sapere se la chiave e il credito ci sono. */
async function verificaAnthropic(chiave: string | undefined): Promise<LetturaCredito> {
  if (!chiave) return servizioNonConfigurato(CHIAVI.anthropic);
  try {
    const risposta = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': chiave, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(ATTESA_MS),
      cache: 'no-store',
    });
    const corpo = (await risposta.text()).slice(0, 400);
    return leggiAnthropic(risposta.status, corpo);
  } catch (errore) {
    return {
      stato: 'NON_RAGGIUNGIBILE',
      dettaglio: `La chiamata non è arrivata al fornitore: ${(errore as Error).message || 'errore di rete'}.`,
      rimedio: 'Controlla la rete in uscita del server e riprova.',
    };
  }
}

/** Il `rate_limit` di GitHub è gratuito e non consuma la quota della consegna. */
async function verificaGitHub(token: string | undefined): Promise<LetturaCredito> {
  try {
    const risposta = await fetch('https://api.github.com/rate_limit', {
      headers: {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(ATTESA_MS),
      cache: 'no-store',
    });
    if (!risposta.ok) {
      return {
        stato: 'NON_RAGGIUNGIBILE',
        dettaglio: `GitHub ha risposto ${risposta.status}.`,
        rimedio: 'Riprova fra qualche minuto: il conteggio non è un dato che si può dedurre.',
      };
    }
    return leggiGitHub(await risposta.json(), Boolean(token));
  } catch (errore) {
    return {
      stato: 'NON_RAGGIUNGIBILE',
      dettaglio: `La chiamata non è arrivata a GitHub: ${(errore as Error).message || 'errore di rete'}.`,
      rimedio: 'Controlla la rete in uscita del server e riprova.',
    };
  }
}

/** I consumi AI delle ultime 24 ore, per funzione. Se la tabella non c'è, si dice. */
async function usoAiRecente(): Promise<UsoAi[]> {
  try {
    const r = await pool.query(
      `SELECT funzione, COALESCE(SUM(chiamate), 0)::int AS chiamate
         FROM public.uso_ai
        WHERE periodo > now() - interval '24 hours'
        GROUP BY funzione
        ORDER BY funzione`
    );
    return r.rows.map((x) => ({ funzione: String(x.funzione), chiamate: Number(x.chiamate) }));
  } catch {
    return [];
  }
}

export async function verificaServiziEsterniAction(): Promise<EsitoServiziEsterni> {
  await richiediSuperadmin();

  const env = process.env;
  const voci: VoceServizio[] = [];

  // 1. Anthropic — il servizio che costa per chiamata.
  voci.push({
    nome: 'Funzioni AI (Anthropic)',
    chiave: CHIAVI.anthropic,
    configurazione: env.ANTHROPIC_API_KEY ? 'PRESENTE' : 'ASSENTE',
    lettura: await verificaAnthropic(env.ANTHROPIC_API_KEY),
  });

  // 2. GitHub — la consegna si verifica dalle sue API.
  voci.push({
    nome: 'GitHub (verifica della consegna)',
    chiave: CHIAVI.github,
    configurazione: env.GH_TOKEN ? 'PRESENTE' : 'ASSENTE',
    lettura: await verificaGitHub(env.GH_TOKEN),
  });

  // 3. Vercel Blob — non ha un endpoint di credito: si dichiara solo se la
  //    chiave c'è, senza far passare per «verificato» ciò che non lo è.
  voci.push({
    nome: 'Archivio file (Vercel Blob)',
    chiave: CHIAVI.blob,
    configurazione: env.BLOB_READ_WRITE_TOKEN ? 'PRESENTE' : 'ASSENTE',
    lettura: env.BLOB_READ_WRITE_TOKEN
      ? {
          stato: 'OK',
          dettaglio: 'La chiave è impostata (il fornitore non espone un saldo da interrogare).',
          rimedio: 'Nessuna azione: la verifica vera è il primo caricamento che riesce.',
        }
      : servizioNonConfigurato(CHIAVI.blob),
  });

  // 4. Il database — senza, non c'è piattaforma.
  let letturaDb: LetturaCredito;
  try {
    await pool.query('SELECT 1');
    letturaDb = {
      stato: 'OK',
      dettaglio: 'Il database risponde.',
      rimedio: 'Nessuna azione.',
    };
  } catch (errore) {
    letturaDb = {
      stato: 'NON_RAGGIUNGIBILE',
      dettaglio: `Il database non risponde: ${(errore as Error).message || 'errore'}.`,
      rimedio: 'Verifica la variabile DATABASE_URL e che il server del database sia attivo.',
    };
  }
  voci.push({
    nome: 'Database',
    chiave: CHIAVI.database,
    configurazione: env.DATABASE_URL || env.PORTABLE ? 'PRESENTE' : 'ASSENTE',
    lettura: letturaDb,
  });

  return {
    success: true,
    quando: new Date().toISOString(),
    voci,
    usoAi: await usoAiRecente(),
  };
}
