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
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { pool } from '@/lib/db';
import { otpauthUri, verificaTotp } from '@/lib/mfa/totp';
import { COOKIE_PENDING } from '@/lib/mfa/challenge';
import { creaSessione } from '@/lib/sessione';
import type { FattoreMfa, StatoMfa, RispostaPassoMfa } from '@/lib/mfa/tipi';

const EMITTENTE = 'CCIIPlatform';
// Oltre questo numero di codici o PIN errati la verifica viene annullata e
// bisogna ripartire dal login (con la password).
const MAX_TENTATIVI_FALLITI = 5;

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
  fattori_totali: number | null;
}

async function leggiChallenge(): Promise<RigaChallenge | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_PENDING)?.value;
  if (!token) return null;
  const r = await pool.query(
    `SELECT token, identita_key, ruolo, workspace_id, email, username, codice_spazio,
            tenant_id, go_to_choice, fattori_rimasti, fattori_totali
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
  // Il totale non è una costante: dipende da quanti fattori questa identità
  // deve superare. `fattori_rimasti` si accorcia a ogni passo superato, e la
  // challenge nasce con la lista completa: il totale si ricava da quanti ne
  // restano più quanti ne sono già stati fatti.
  const rimasti = ch.fattori_rimasti.length;
  const totale = Math.max(rimasti, ch.fattori_totali ?? rimasti);
  const passo = totale - rimasti + 1;
  return { attivo: true, fase, username: ch.username, enroll, passo, totale };
}

/**
 * Registra un codice o PIN errato. Al raggiungimento del limite elimina la
 * challenge: per riprovare bisogna rifare il login con la password.
 */
async function registraTentativoFallito(
  ch: RigaChallenge,
  messaggio: string
): Promise<RispostaPassoMfa> {
  const r = await pool.query(
    `UPDATE public.mfa_challenge SET tentativi_falliti = tentativi_falliti + 1
      WHERE token = $1 RETURNING tentativi_falliti`,
    [ch.token]
  );
  const tentativi: number = r.rows[0]?.tentativi_falliti ?? MAX_TENTATIVI_FALLITI;
  if (tentativi >= MAX_TENTATIVI_FALLITI) {
    await pool.query('DELETE FROM public.mfa_challenge WHERE token = $1', [ch.token]);
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_PENDING);
    return { success: false, error: 'Troppi tentativi errati. Rifai il login.' };
  }
  return { success: false, error: messaggio };
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
      return await registraTentativoFallito(ch, 'Codice non valido o scaduto. Riprova.');
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
        return await registraTentativoFallito(ch, 'PIN non corretto.');
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
