// src/lib/mfa/pinSessione.ts
//
// IL PIN DEL SECONDO FATTORE, CHIESTO DI NUOVO PER UN ATTO SENSIBILE.
//
// Al login il PIN è uno dei fattori (src/lib/mfa/challenge.ts). Qui si chiede
// un'altra volta, dentro una sessione già aperta, per firmare un cambiamento
// che non è una preferenza: che atto sta valutando lo scenario.
//
// Perché non basta la sessione: un browser lasciato aperto non deve poter
// cambiare l'atto in valutazione. Il PIN è un secondo segreto, vive nel
// database come hash e non è la password.
//
// I tentativi passano dal limitatore CONDIVISO (public.tentativi_accesso), con
// una chiave propria: sbagliare qui non consuma i tentativi di accesso. Il
// blocco è lo stesso (5 tentativi, 15 minuti), perché il PIN è corto.
//
// Il tempo del blocco è quello del database, quindi vale su tutte le istanze.

import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { assicuraTabelleMfa } from '@/db/ensureTables';
import { leggiSessione } from '@/lib/autorizzazione';
import {
  azzeraTentativiCondivisi,
  controllaTentativiCondivisi,
  messaggioBlocco,
  registraFallimentoCondiviso,
} from '@/lib/tentativiAccessoCondivisi';
import { chiaveTentativiPin, identitaKeyDaSessione, pinBenFormato } from '@/lib/mfa/pinIdentita';

export type EsitoPin = { ok: true } | { ok: false; error: string };

/**
 * Verifica il PIN dell'utente della sessione corrente. Non lancia: un
 * verificatore che lancia costringerebbe ogni chiamante a un try/catch, e
 * basta un ramo dimenticato per trasformare un PIN sbagliato in un 500.
 */
export async function verificaPinSecondoFattore(pin: string): Promise<EsitoPin> {
  const sessione = await leggiSessione();
  if (!sessione) return { ok: false, error: 'Sessione assente o scaduta: rientra e riprova.' };

  const identitaKey = identitaKeyDaSessione(sessione);
  if (!identitaKey) {
    return { ok: false, error: 'Per questo accesso non c’è un PIN del secondo fattore.' };
  }

  const valore = String(pin ?? '').trim();
  if (!pinBenFormato(valore)) return { ok: false, error: 'Il PIN è di 4-6 cifre.' };

  const chiave = chiaveTentativiPin(identitaKey);
  const controllo = await controllaTentativiCondivisi(pool, chiave);
  if (controllo.bloccato) {
    return { ok: false, error: messaggioBlocco(controllo.secondiRimanenti) };
  }

  await assicuraTabelleMfa();
  const r = await pool.query(
    'SELECT pin_hash FROM public.mfa_credenziali WHERE identita_key = $1',
    [identitaKey]
  );
  const hash: string | undefined = r.rows[0]?.pin_hash;
  if (!hash) {
    return {
      ok: false,
      error:
        'PIN non impostato per questo accesso: impostalo al prossimo ingresso, oppure chiedi all’Admin di Spazio di annullare il cambio.',
    };
  }

  if (!(await bcrypt.compare(valore, hash))) {
    const dopo = await registraFallimentoCondiviso(pool, chiave);
    return {
      ok: false,
      error: dopo.bloccato ? messaggioBlocco(dopo.secondiRimanenti) : 'PIN non corretto.',
    };
  }

  await azzeraTentativiCondivisi(pool, chiave);
  return { ok: true };
}
