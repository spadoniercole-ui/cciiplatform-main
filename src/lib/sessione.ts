// src/lib/sessione.ts
//
// Creazione della sessione autenticata, estratta da actions/auth.ts perché
// ora è usata in DUE momenti diversi: dal login classico (quando l'MFA è
// disattivato) e dal completamento dell'MFA (actions/mfa.ts). Tenerla qui,
// in un modulo neutro, evita un ciclo di import tra auth e mfa.

import { cookies } from 'next/headers';
import crypto from 'crypto';
import { pool } from '@/lib/db';

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
    secure: process.env.NODE_ENV === 'production' && process.env.PORTABLE !== '1',
    sameSite: 'lax',
    path: '/',
    expires: scadenza,
  });
}
