// src/lib/mfa/challenge.ts
//
// Avvio della challenge MFA, chiamato da actions/auth.ts SOLO dopo aver
// verificato la password. Sta qui, in un modulo senza 'use server', perché
// una funzione esportata da un file 'use server' è un endpoint pubblico:
// da actions/mfa.ts chiunque avrebbe potuto avviare una challenge per
// un'identità a scelta (anche SUPERADMIN) saltando la password.

import { cookies } from 'next/headers';
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { assicuraTabelleMfa } from '@/db/ensureTables';
import { generaSegretoBase32 } from '@/lib/mfa/totp';
import type { FattoreMfa, DatiAvvioChallenge } from '@/lib/mfa/tipi';
import { cookieSicuro } from '@/lib/cookieSicuro';

export const COOKIE_PENDING = 'mfa_pending';
const DURATA_CHALLENGE_MIN = 10;

function cookieOpts(scadenza: Date) {
  return {
    httpOnly: true as const,
    secure: cookieSicuro(),
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

  // ---------------------------------------------------------------------
  // COMPOSIZIONE DEI FATTORI — diversa per il SUPERADMIN
  //
  // Il Superadmin non ha una riga nel database e la sua password vive nelle
  // variabili d'ambiente: e' quindi gia' immune a tutta la classe di
  // minacce che passa dal database (injection, dump rubato, backup
  // smarrito). Nemmeno il backup completo lo contiene.
  //
  // Resta pero' esposto dalla porta d'ingresso, che e' pubblica: la sua
  // password e' una stringa statica, in chiaro nella configurazione, senza
  // scadenza ne' rotazione. Se finisce fuori — accesso al progetto di
  // hosting, log di build, uno screenshot durante una dimostrazione — chi la
  // ottiene entra, e non resta traccia di nulla.
  //
  // Il secondo fattore serve a questo, e il suo valore non sta nel
  // meccanismo ma nel fatto che il secondo segreto viva in un POSTO DIVERSO
  // dal primo: la password nell'ambiente, l'hash del PIN nel database. Due
  // vie di compromissione distinte, nessuna delle due sufficiente da sola.
  //
  // Il TOTP aggiunge poco a questa separazione (l'hash del PIN sta gia' nel
  // database, come il segreto TOTP) e costa molto in attrito: app
  // authenticator, QR, segreto da recuperare al cambio di telefono. Per il
  // solo Superadmin viene percio' escluso; per Admin di Spazio e Operatori
  // resta invariato, perche' quelli nel database ci sono eccome.
  const fattori: FattoreMfa[] = [];
  const soloPin = d.ruolo === 'SUPERADMIN';
  if (!soloPin) {
    fattori.push(totpAttivo ? 'TOTP' : 'TOTP_ENROLL');
  }
  fattori.push(pinPresente ? 'PIN' : 'PIN_SETUP');

  const token = crypto.randomBytes(32).toString('hex');
  const scadenza = new Date(Date.now() + DURATA_CHALLENGE_MIN * 60 * 1000);

  await pool.query('DELETE FROM public.mfa_challenge WHERE expires_at < now()');
  await pool.query(
    `INSERT INTO public.mfa_challenge
       (token, identita_key, ruolo, workspace_id, email, username, codice_spazio, tenant_id, go_to_choice, fattori_rimasti, expires_at, fattori_totali)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
      fattori.length,
    ]
  );

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_PENDING, token, cookieOpts(scadenza));

  return { next: fattori[0] };
}
