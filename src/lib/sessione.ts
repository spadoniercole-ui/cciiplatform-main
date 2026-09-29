// src/lib/sessione.ts
//
// Creazione della sessione autenticata, estratta da actions/auth.ts perché
// ora è usata in DUE momenti diversi: dal login classico (quando l'MFA è
// disattivato) e dal completamento dell'MFA (actions/mfa.ts). Tenerla qui,
// in un modulo neutro, evita un ciclo di import tra auth e mfa.

import { cookies } from 'next/headers';
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { cookieSicuro } from '@/lib/cookieSicuro';

const DURATA_SESSIONE_ORE = 8;

export async function creaSessione(
  ruolo: 'SUPERADMIN' | 'USER',
  workspaceId: number | null,
  email?: string,
  username?: string
): Promise<void> {
  const { assicuraTabellaSessioni } = await import('@/db/ensureTables');
  await assicuraTabellaSessioni();

  const token = crypto.randomBytes(32).toString('hex');
  const scadenza = new Date(Date.now() + DURATA_SESSIONE_ORE * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO sessioni (token, ruolo, workspace_id, email, username, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [token, ruolo, workspaceId, email || null, username || null, scadenza]
  );

  const cookieStore = await cookies();
  cookieStore.set('session_token', token, {
    httpOnly: true,
    // Secure solo in produzione E non nell'edizione portable (HTTP locale).
    secure: cookieSicuro(),
    sameSite: 'lax',
    path: '/',
    expires: scadenza,
  });
}

/**
 * Chiude le sessioni aperte di un utente di spazio: dopo un cambio o una
 * rigenerazione della password, o dopo la disattivazione, chi aveva già una
 * sessione non deve poter continuare fino alla sua scadenza (8 ore).
 * `eccettoToken` lascia aperta la sessione di chi sta cambiando la propria
 * password. L'identità è lo username (dalla 0.109) o, per sessioni più
 * vecchie, l'email.
 */
export async function chiudiSessioniUtente(
  spazioId: number,
  identita: { username: string | null; email: string | null },
  eccettoToken?: string
): Promise<void> {
  if (!identita.username && !identita.email) return;
  await pool.query(
    `DELETE FROM sessioni
      WHERE workspace_id = $1
        AND ((username IS NOT NULL AND username = $2) OR (email IS NOT NULL AND email = $3))
        AND token <> $4`,
    [spazioId, identita.username, identita.email?.toLowerCase() ?? null, eccettoToken ?? '']
  );
}
