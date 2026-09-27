#!/usr/bin/env node
// Ogni funzione esportata da un file 'use server' è un endpoint pubblico:
// chiunque può invocarla dal browser, anche senza login. Questo controllo
// fallisce se una server action in src/app/actions non verifica il
// chiamante con una delle funzioni di src/lib/autorizzazione.ts (o con
// ottieniContestoAccessoSpazio) nelle prime righe del corpo.
//
// Le poche azioni pubbliche per scelta (login, MFA, logout) sono elencate
// in PUBBLICHE: aggiungerne una richiede una decisione esplicita.
import fs from 'node:fs';
import path from 'node:path';

const CARTELLA = 'src/app/actions';
const PUBBLICHE = new Set([
  'auth.ts:eseguiAutenticazione',
  'auth.ts:eseguiLogout',
  'auth.ts:ottieniListaWorkspace',
  'mfa.ts:mfaStato',
  'mfa.ts:mfaVerificaTotp',
  'mfa.ts:mfaInviaPin',
  'mfa.ts:mfaAnnulla',
  'spazi.ts:esciDaSalvagenteAction',
  // Delegano alla guardia centrale (risolviContestoSpazio / contestoIspezioneCorrente).
  'spazi.ts:ottieniContestoIspezione',
  'spazi.ts:ottieniContestoAccessoSpazio',
]);
const GUARDIA =
  /\b(richiedi(Sessione|Superadmin|AccessoSchema|AccessoSpazio|AccessoSpazioId)|ottieniContestoAccessoSpazio)\(/;
// Funzioni pubbliche che delegano a un helper privato già protetto.
const DELEGA = /^\s*return (\w+)\(/;

const errori = [];
for (const nome of fs.readdirSync(CARTELLA).filter((f) => f.endsWith('.ts'))) {
  const testo = fs.readFileSync(path.join(CARTELLA, nome), 'utf8');
  if (!/^'use server';/m.test(testo)) continue;
  const re = /^export async function (\w+)\(/gm;
  let m;
  while ((m = re.exec(testo))) {
    const chiave = `${nome}:${m[1]}`;
    if (PUBBLICHE.has(chiave)) continue;
    const inizio = testo.indexOf('{\n', testo.indexOf(')', m.index)) + 2;
    const corpo = testo.slice(inizio, inizio + 2500).split(/\n(?=export )/)[0];
    const primeRighe = corpo.split('\n').slice(0, 40).join('\n');
    if (GUARDIA.test(primeRighe)) continue;
    const delega = DELEGA.exec(corpo.split('\n')[0]);
    if (delega) {
      const helper = new RegExp(`function ${delega[1]}\\([\\s\\S]{0,2500}`).exec(testo)?.[0] ?? '';
      if (GUARDIA.test(helper.split('\n').slice(0, 40).join('\n'))) continue;
    }
    errori.push(`${CARTELLA}/${chiave}`);
  }
}

if (errori.length) {
  console.error(
    "ERRORE: server action senza verifica del chiamante (vedi src/lib/autorizzazione.ts):\n  " +
      errori.join('\n  ')
  );
  process.exit(1);
}
console.log('OK: ogni server action verifica il chiamante.');
