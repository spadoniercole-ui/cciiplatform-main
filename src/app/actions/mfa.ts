'use server';

// MFA a tre fattori: password (in actions/auth.ts) + TOTP (app authenticator)
// + PIN personale. Fra la password superata e la creazione della sessione si
// interpone una "challenge": una riga transitoria (public.mfa_challenge) che
// tiene i fattori ancora da superare e i dati per costruire poi la sessione
// giusta. Il cookie `mfa_pending` (httpOnly, breve) fa da riferimento.
//
// I segreti TOTP e il PIN vivono in public.mfa_credenziali, indicizzati da una
// chiave d'identità stabile valida per ogni tipo di utente (superadmin, admin
// di spazio, operatore). Così un solo flusso copre tutti.

import { cookies } from 'next/headers';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { pool } from '@/lib/db';
import { assicuraTabelleMfa } from '@/db/ensureTables';
import { generaSegretoBase32, otpauthUri, verificaTotp } from '@/lib/mfa/totp';
import { creaSessione } from '@/lib/sessione';
import type { FattoreMfa, DatiAvvioChallenge, StatoMfa, RispostaPassoMfa } from '@/lib/mfa/tipi';

const COOKIE_PENDING = 'mfa_pending';
const DURATA_CHALLENGE_MIN = 10;
const EMITTENTE = 'CCIIPlatform';

interface RigaChallenge {
  token: string;
  identita_key: string;
  ruolo: 'SUPERADMIN' | 'USER';
  workspace_id: number | null;
  email: string | null;
  username: string | null;
  codice_spazio: string | null;
  tenant_id: string | null;
  go_to_choice: boolean;
  fattori_rimasti: string[];
}

function cookieOpts(scadenza: Date) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production' && process.env.PORTABLE !== '1',
    sameSite: 'lax' as const,
    path: '/',
    expires: scadenza,
  };
}

/** Avvia la challenge MFA dopo che la password è stata verificata. Interna:
 * chiamata da actions/auth.ts. Ritorna il primo fattore da superare. */
export async function avviaChallengeMfa(d: DatiAvvioChallenge): Promise<{ next: FattoreMfa }> {
  await assicuraTabelleMfa();

  const cred = await pool.query(
    'SELECT totp_secret, totp_attivo, pin_hash FROM public.mfa_credenziali WHERE identita_key = $1',
    [d.identitaKey]
  );

  let totpAttivo = false;
  let pinPresente = false;

  if (cred.rows.length === 0) {
    const secret = generaSegretoBase32();
    await pool.query(
      `INSERT INTO public.mfa_credenziali (identita_key, ruolo, workspace_id, username, totp_secret, totp_attivo)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       ON CONFLICT (identita_key) DO NOTHING`,
      [d.identitaKey, d.ruolo, d.workspaceId, d.username, secret]
    );
  } else {
    totpAttivo = cred.rows[0].totp_attivo === true;
    pinPresente = !!cred.rows[0].pin_hash;
    if (!cred.rows[0].totp_secret) {
      await pool.query(
        'UPDATE public.mfa_credenziali SET totp_secret = $2, updated_at = now() WHERE identita_key = $1',
        [d.identitaKey, generaSegretoBase32()]
      );
    }
  }

  const fattori: FattoreMfa[] = [];
  fattori.push(totpAttivo ? 'TOTP' : 'TOTP_ENROLL');
  fattori.push(pinPresente ? 'PIN' : 'PIN_SETUP');

  const token = crypto.randomBytes(32).toString('hex');
  const scadenza = new Date(Date.now() + DURATA_CHALLENGE_MIN * 60 * 1000);

  await pool.query('DELETE FROM public.mfa_challenge WHERE expires_at < now()');
  await pool.query(
    `INSERT INTO public.mfa_challenge
       (token, identita_key, ruolo, workspace_id, email, username, codice_spazio, tenant_id, go_to_choice, fattori_rimasti, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      token,
      d.identitaKey,
      d.ruolo,
      d.workspaceId,
      d.email,
      d.username,
      d.codiceSpazio,
      d.tenantId,
      d.goToChoice,
      fattori,
      scadenza,
    ]
  );

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_PENDING, token, cookieOpts(scadenza));

  return { next: fattori[0] };
}

async function leggiChallenge(): Promise<RigaChallenge | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_PENDING)?.value;
  if (!token) return null;
  const r = await pool.query(
    `SELECT token, identita_key, ruolo, workspace_id, email, username, codice_spazio,
            tenant_id, go_to_choice, fattori_rimasti
       FROM public.mfa_challenge
      WHERE token = $1 AND expires_at > now()`,
    [token]
  );
  if (r.rows.length === 0) return null;
  return r.rows[0] as RigaChallenge;
}

/** Stato corrente della challenge, per pilotare la UI. */
export async function mfaStato(): Promise<StatoMfa> {
  const ch = await leggiChallenge();
  if (!ch || ch.fattori_rimasti.length === 0) return { attivo: false };
  const fase = ch.fattori_rimasti[0] as FattoreMfa;

  let enroll: StatoMfa['enroll'];
  if (fase === 'TOTP_ENROLL') {
    const cred = await pool.query(
      'SELECT totp_secret FROM public.mfa_credenziali WHERE identita_key = $1',
      [ch.identita_key]
    );
    const secret: string | undefined = cred.rows[0]?.totp_secret;
    if (secret) {
      const uri = otpauthUri(secret, ch.username || 'utente', EMITTENTE);
      const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
      enroll = { segreto: secret, otpauthUri: uri, qrDataUrl };
    }
  }
  return { attivo: true, fase, username: ch.username, enroll };
}

/** Toglie il primo fattore; se non ne restano, crea la sessione reale. */
async function avanzaFattore(ch: RigaChallenge): Promise<RispostaPassoMfa> {
  const restanti = ch.fattori_rimasti.slice(1);
  if (restanti.length > 0) {
    await pool.query('UPDATE public.mfa_challenge SET fattori_rimasti = $2 WHERE token = $1', [
      ch.token,
      restanti,
    ]);
    return { success: true, completato: false, next: restanti[0] as FattoreMfa };
  }

  // Tutti i fattori superati: crea la sessione e chiudi la challenge.
  await creaSessione(ch.ruolo, ch.workspace_id, ch.email || undefined, ch.username || undefined);
  await pool.query('DELETE FROM public.mfa_challenge WHERE token = $1', [ch.token]);
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_PENDING);

  return {
    success: true,
    completato: true,
    role: ch.ruolo,
    goToChoice: ch.go_to_choice,
    tenantName: ch.codice_spazio,
    tenantId: ch.tenant_id,
  };
}

/** 2° fattore: verifica il codice TOTP (in enrollment lo attiva). */
export async function mfaVerificaTotp(codiceInput: unknown): Promise<RispostaPassoMfa> {
  try {
    const ch = await leggiChallenge();
    if (!ch) return { success: false, error: 'Verifica scaduta. Rifai il login.' };
    const fase = ch.fattori_rimasti[0];
    if (fase !== 'TOTP' && fase !== 'TOTP_ENROLL') {
      return { success: false, error: 'Passo non valido.' };
    }
    const cred = await pool.query(
      'SELECT totp_secret FROM public.mfa_credenziali WHERE identita_key = $1',
      [ch.identita_key]
    );
    const secret: string | undefined = cred.rows[0]?.totp_secret;
    if (!secret) return { success: false, error: 'Configurazione TOTP mancante. Rifai il login.' };

    if (!verificaTotp(secret, String(codiceInput || ''))) {
      return { success: false, error: 'Codice non valido o scaduto. Riprova.' };
    }
    if (fase === 'TOTP_ENROLL') {
      await pool.query(
        'UPDATE public.mfa_credenziali SET totp_attivo = TRUE, updated_at = now() WHERE identita_key = $1',
        [ch.identita_key]
      );
    }
    return await avanzaFattore(ch);
  } catch (error: unknown) {
    console.error('[mfaVerificaTotp] Errore:', error);
    return { success: false, error: 'Errore interno nella verifica.' };
  }
}

/** 3° fattore: imposta (primo accesso) o verifica il PIN personale. */
export async function mfaInviaPin(pinInput: unknown): Promise<RispostaPassoMfa> {
  try {
    const ch = await leggiChallenge();
    if (!ch) return { success: false, error: 'Verifica scaduta. Rifai il login.' };
    const fase = ch.fattori_rimasti[0];
    if (fase !== 'PIN' && fase !== 'PIN_SETUP') {
      return { success: false, error: 'Passo non valido.' };
    }
    const pin = String(pinInput || '').trim();
    if (!/^\d{4,6}$/.test(pin)) {
      return { success: false, error: 'Il PIN deve essere di 4-6 cifre.' };
    }

    if (fase === 'PIN_SETUP') {
      const hash = await bcrypt.hash(pin, 10);
      await pool.query(
        'UPDATE public.mfa_credenziali SET pin_hash = $2, updated_at = now() WHERE identita_key = $1',
        [ch.identita_key, hash]
      );
    } else {
      const cred = await pool.query(
        'SELECT pin_hash FROM public.mfa_credenziali WHERE identita_key = $1',
        [ch.identita_key]
      );
      const hash: string | undefined = cred.rows[0]?.pin_hash;
      if (!hash || !(await bcrypt.compare(pin, hash))) {
        return { success: false, error: 'PIN non corretto.' };
      }
    }
    return await avanzaFattore(ch);
  } catch (error: unknown) {
    console.error('[mfaInviaPin] Errore:', error);
    return { success: false, error: 'Errore interno nella verifica.' };
  }
}

/** Annulla la challenge in corso (bottone "torna al login"). */
export async function mfaAnnulla(): Promise<{ success: true }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_PENDING)?.value;
  if (token) {
    await pool.query('DELETE FROM public.mfa_challenge WHERE token = $1', [token]).catch(() => {});
  }
  cookieStore.delete(COOKIE_PENDING);
  return { success: true };
}
