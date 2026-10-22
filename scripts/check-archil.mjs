#!/usr/bin/env node
// scripts/check-archil.mjs
//
// Verifica la persistenza su un disco Archil: scrive una riga univoca in una
// sottocartella nuova con un exec e la rilegge con un secondo exec separato.
// Ogni exec gira in un container nuovo: se la riga torna, il disco persiste.
//
// Uso: npm run check:archil
// Richiede ARCHIL_API_KEY (in .env.local o nell'ambiente). Se ARCHIL_DISK_ID
// manca, crea un disco e ne salva l'id in .env.local (il mount token non viene
// mai stampato).
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

function esci(messaggio) {
  console.error(`✖ ${messaggio}`);
  process.exit(1);
}

// Il modulo condiviso è TypeScript: node lo importa solo da 22.19 in poi, la stessa
// versione minima richiesta dall'SDK `disk`. Meglio dirlo che far fallire l'import.
const [maggiore, minore] = process.versions.node.split('.').map(Number);
if (maggiore < 22 || (maggiore === 22 && minore < 19)) {
  esci(
    `serve Node.js 22.19 o successivo (in uso: ${process.versions.node}): l'SDK disk e l'import del modulo TypeScript non funzionano prima.`
  );
}

const { creaDiscoArchil, discoArchil, regioneArchil } = await import('../src/lib/archil.ts');

/** Aggiunge o aggiorna ARCHIL_DISK_ID nel file env locale (mai committato). */
function salvaDiscoId(id) {
  const file = '.env.local';
  const riga = `ARCHIL_DISK_ID=${id}`;
  let testo = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (/^ARCHIL_DISK_ID=.*$/m.test(testo)) {
    testo = testo.replace(/^ARCHIL_DISK_ID=.*$/m, riga);
  } else {
    if (testo && !testo.endsWith('\n')) testo += '\n';
    testo += `${riga}\n`;
  }
  fs.writeFileSync(file, testo, { mode: 0o600 });
  console.info(`ARCHIL_DISK_ID salvato in ${file}.`);
}

const apiKey = (process.env.ARCHIL_API_KEY || '').trim();
if (!apiKey) {
  esci(
    'ARCHIL_API_KEY non impostata. Copiare .env.example in .env.local e inserire la chiave (inizia con "key-").'
  );
}
if (!apiKey.startsWith('key-')) {
  esci(
    'ARCHIL_API_KEY non sembra una chiave API (deve iniziare con "key-"). Un token di mount (adt_…) non funziona.'
  );
}

async function main() {
  let idDisco = (process.env.ARCHIL_DISK_ID || '').trim();
  if (!idDisco) {
    const nome = `ccii-persistenza-${Date.now()}`;
    console.info(`Nessun ARCHIL_DISK_ID: creo il disco "${nome}"…`);
    const creato = await creaDiscoArchil(nome);
    idDisco = creato.id;
    process.env.ARCHIL_DISK_ID = idDisco;
    salvaDiscoId(idDisco);
    console.info(`Disco creato: ${creato.nome} (${creato.id}).`);
  }

  const disco = await discoArchil();
  const sottocartella = `verifiche/persistenza-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const percorso = `${sottocartella}/prova.txt`;
  const contenuto = `riga-${crypto.randomUUID()}`;

  console.info(`Disco ${disco.id} (${disco.region || regioneArchil()}): scrivo ${percorso}…`);
  // Primo exec: la cartella è nuova, quindi l'ownership dinamica la assegna a questo
  // container e la scrittura non incontra «Read-only file system».
  const scrittura = await disco.exec(
    `set -eu\nmkdir -p '${sottocartella}'\nprintf '%s' '${contenuto}' > '${percorso}'`
  );
  if (scrittura.exitCode !== 0) {
    if (scrittura.stdout) console.error(scrittura.stdout);
    if (scrittura.stderr) console.error(scrittura.stderr);
    esci(`la scrittura è fallita (exit ${scrittura.exitCode}).`);
  }

  console.info('Scrittura completata; rileggo con un secondo exec separato…');
  // Secondo exec: container nuovo, niente stato del precedente. Se la riga torna,
  // quello che è sopravvissuto è il disco.
  const lettura = await disco.exec(`cat '${percorso}'`);
  if (lettura.exitCode !== 0) {
    if (lettura.stdout) console.error(lettura.stdout);
    if (lettura.stderr) console.error(lettura.stderr);
    esci(`la rilettura è fallita (exit ${lettura.exitCode}).`);
  }

  const letto = lettura.stdout.trim();
  if (!lettura.stdout.includes(contenuto)) {
    esci(`contenuto diverso: scritto "${contenuto}", letto "${letto}".`);
  }

  console.info(`✔ Persistenza verificata: ${letto}`);
  console.info(`  disco: ${disco.name || '(senza nome)'} (${disco.id})`);
  console.info(`  regione: ${disco.region || regioneArchil()}`);
  console.info(`  file: /mnt/data/${percorso}`);
}

main().catch((errore) => {
  const messaggio = errore instanceof Error ? errore.message : String(errore);
  if (/401|unauthor/i.test(messaggio)) {
    esci(
      `chiave rifiutata (401): probabilmente è un token di mount o una chiave di un'altra regione. Usare una chiave "key-" da https://console.archil.com/api-keys nella regione del disco. Dettaglio: ${messaggio}`
    );
  }
  esci(`errore: ${messaggio}`);
});
