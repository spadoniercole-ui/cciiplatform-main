#!/usr/bin/env node
// scripts/demo-locale.mjs
//
// L'AMBIENTE DEMO LOCALE, IN UN COMANDO (0.243.0).
//
// Prima servivano dodici passaggi: binari di Postgres, initdb, tabelle globali,
// licenza, spazio demo, PIN, ingresso in salvagente. E al riavvio del runner
// — che cancella /tmp — spariva tutto. Qui il database è PGlite (Postgres in
// WASM, già dipendenza del progetto per l'edizione portable): nessun server da
// installare, e i dati stanno in `.dati-demo/` dentro il progetto, che
// sopravvive al riavvio.
//
// Al primo avvio vengono creati i due spazi portable e, con
// PORTABLE_SEED_ENTE_DEMO=1, il percorso demo dell'ente: Tessitura Lario e le
// altre quattro posizioni, già pronte per la pagina Posizione.
//
// PERCHÉ `next start` E NON `next dev`. In questo progetto il dev server non
// compila `pg` (errore «Can't resolve 'fs'» già presente senza questa
// modifica): la demo parte dalla build di produzione, che è quella che la CI
// verifica. Se la build manca, la si fa una volta sola.
//
// Non è una consegna: è un ambiente di prova. La passphrase cifra un database
// locale di dati fittizi; non è un segreto e non va riusata altrove.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PORTA = process.env.DEMO_PORTA || '3006';
const DATI = process.env.PORTABLE_DATA_DIR || path.join(process.cwd(), '.dati-demo');
mkdirSync(DATI, { recursive: true });

console.log('');
console.log('Ambiente demo locale — database PGlite in ' + DATI);
console.log('  Spazio ente:  RICEVENTE-LOCALE-2026-001');
console.log('  Accesso:      admin.ricevente / ricevente1234');
console.log('  Posizione:    /spazio/RICEVENTE-LOCALE-2026-001/verifica-salute/2/posizione');
console.log('');
console.log('La prima volta il caricamento della demo richiede qualche secondo.');
console.log('Per ripartire da zero: fermare il server e cancellare ' + DATI);
console.log('');

const conPortable = {
  ...process.env,
  PORTABLE: '1',
  PORTABLE_PASSPHRASE: process.env.PORTABLE_PASSPHRASE || 'demo-locale-2026',
  PORTABLE_DATA_DIR: DATI,
  PORTABLE_SEED_ENTE_DEMO: '1',
  NEXT_TELEMETRY_DISABLED: '1',
};

// La build si fa come in cloud (senza PORTABLE): l'edizione portable imposta
// l'output standalone, che `next start` non serve.
const senzaPortable = { ...conPortable };
delete senzaPortable.PORTABLE;
delete senzaPortable.NEXT_PUBLIC_PORTABLE;

const esegui = (comando, argomenti, env, attendi) =>
  (attendi ? spawnSync : spawn)(comando, argomenti, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });

if (!existsSync(path.join(process.cwd(), '.next', 'BUILD_ID'))) {
  console.log('Build di produzione assente: la compilo (una volta sola)…');
  const build = esegui('npx', ['next', 'build'], senzaPortable, true);
  if (build.status !== 0) {
    console.error('Build non riuscita: la demo non parte.');
    process.exit(build.status ?? 1);
  }
}

const figlio = esegui(
  'npx',
  ['next', 'start', '-H', '0.0.0.0', '-p', String(PORTA)],
  conPortable,
  false
);

figlio.on('exit', (codice) => process.exit(codice ?? 0));
figlio.on('error', (errore) => {
  console.error('Avvio non riuscito:', errore.message);
  process.exit(1);
});
