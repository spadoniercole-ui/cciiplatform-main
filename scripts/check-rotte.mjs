#!/usr/bin/env node
// ROTTE SENZA PORTA — un controllo che non si dimentica le pagine.
//
// Una pagina che nessun link, redirect o voce di menu apre resta viva solo per
// chi ha un vecchio segnalibro: invecchia senza che nessuno la veda, e porta
// con sé un'uscita che non c'entra. È già successo con le sotto-pagine legacy
// della scheda azienda (bilanci, indici, checklist).
//
// Il controllo elenca tutte le pagine raggiungibili solo dall'URL e fallisce
// quando ne compare una nuova. Le orfane già note stanno in
// `scripts/porte-rotte.json`, ognuna con il motivo per cui resta: aggiungerne
// una richiede una decisione esplicita, non un silenzio.
//
// Come si riconosce una porta: un riferimento nel codice a un percorso che
// combacia con la rotta — `href`, `redirect`, `router.push`… non importa il
// nome della prop: conta il percorso. I percorsi composti da variabili locali
// (`const base = \`/spazio/${codice}\`; href={\`${base}/utenti\`}`) vengono
// ricostruiti prima del confronto, purché la variabile sia definita nello
// stesso file. Non si seguono le catene fra file: una rotta che si apre solo
// da un'altra rotta orfana non è una porta.
//
// Uso:
//   node scripts/check-rotte.mjs             elenca e verifica
//   node scripts/check-rotte.mjs --elenco    elenca soltanto (esce 0)
import fs from 'node:fs';
import path from 'node:path';

const RADICE = 'src';
const APP = path.join(RADICE, 'app');
const BASELINE = path.join('scripts', 'porte-rotte.json');
const SOLO_ELENCO = process.argv.includes('--elenco');

// --- 1. Le rotte: ogni page.tsx sotto src/app -------------------------------

function rotteDaCartella(dir, segmenti = []) {
  const rotte = [];
  const voci = fs.readdirSync(dir, { withFileTypes: true });
  if (voci.some((v) => v.isFile() && v.name === 'page.tsx')) {
    rotte.push('/' + segmenti.join('/'));
  }
  for (const voce of voci) {
    if (!voce.isDirectory()) continue;
    // Gruppi di rotta `(nome)`: non entrano nell'URL.
    const nome = voce.name.startsWith('(') && voce.name.endsWith(')') ? null : voce.name;
    rotte.push(
      ...rotteDaCartella(
        path.join(dir, voce.name),
        nome ? [...segmenti, nome] : segmenti
      )
    );
  }
  return rotte;
}

// --- 2. Le porte: i percorsi scritti nel codice ------------------------------

function fileSorgente(dir, accumulati = []) {
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const pieno = path.join(dir, voce.name);
    if (voce.isDirectory()) fileSorgente(pieno, accumulati);
    else if (/\.(ts|tsx)$/.test(voce.name) && !/\.test\.tsx?$/.test(voce.name)) {
      accumulati.push(pieno);
    }
  }
  return accumulati;
}

const LETTERALE_APICE = /`((?:[^`\\]|\\.)*)`/g;
const LETTERALE_VIRGOLETTE = /'((?:[^'\\\n]|\\.)*)'/g;
const VARIABILE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*`((?:[^`\\]|\\.)*)`/g;

/** Sostituisce `${nome}` con il valore della variabile, quando è nota. */
function espandi(testo, variabili) {
  let attuale = testo;
  for (let giro = 0; giro < 6; giro++) {
    const prossimo = attuale.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (intero, nome) =>
      variabili.has(nome) ? variabili.get(nome) : intero
    );
    if (prossimo === attuale) break;
    attuale = prossimo;
  }
  return attuale;
}

/** Le parti dinamiche diventano `§`: due scritture diverse dello stesso id combaciano. */
function normalizza(percorso) {
  return percorso
    .replace(/\$\{[^}]*\}/g, '§')
    .replace(/\/+$/, '')
    .split('?')[0]
    .split('#')[0];
}

const VALORE_DI_TABELLA = /\b(?:id|slug|chiave|codice)\s*:\s*['"]([^'"]+)['"]/g;

/**
 * I link delle voci di menù nascono da una tabella: `${base}/${voce.id}`.
 * L'id non è nel link, è nei dati della tabella accanto: si sostituisce con
 * ognuno dei valori dichiarati nel file, che sono i link davvero costruiti.
 */
function variantiDiTabella(percorso, valori) {
  const espressione = /\$\{([A-Za-z_$][\w$]*\.(?:id|slug|chiave|codice))\}/g;
  if (!espressione.test(percorso) || valori.length === 0) return [percorso];
  const varianti = [];
  for (const valore of valori.slice(0, 120)) {
    varianti.push(percorso.replace(espressione, valore));
  }
  return varianti;
}

function porteDelFile(file) {
  const testo = fs.readFileSync(file, 'utf8');
  const variabili = new Map();
  let m;
  VARIABILE.lastIndex = 0;
  while ((m = VARIABILE.exec(testo))) variabili.set(m[1], m[2]);

  const valori = new Set();
  VALORE_DI_TABELLA.lastIndex = 0;
  while ((m = VALORE_DI_TABELLA.exec(testo))) valori.add(m[1]);

  const percorsi = new Set();
  for (const re of [LETTERALE_APICE, LETTERALE_VIRGOLETTE]) {
    re.lastIndex = 0;
    while ((m = re.exec(testo))) {
      const grezzo = espandi(m[1], variabili);
      if (!grezzo.startsWith('/')) continue;
      if (/\s/.test(grezzo)) continue;
      for (const variante of variantiDiTabella(grezzo, [...valori])) {
        percorsi.add(normalizza(variante));
      }
    }
  }
  return percorsi;
}

// --- 3. Incrocio rotta ↔ porta ----------------------------------------------

function espressioneRotta(rotta) {
  const pezzi = rotta
    .split('/')
    .filter(Boolean)
    .map((segmento) => {
      if (segmento.startsWith('[...') || segmento === '[[...') return '.*';
      if (segmento.startsWith('[')) return '§';
      return segmento.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
  // Dopo la rotta deve finire il percorso: `/`, `?`, `#` o la fine.
  return new RegExp(`/${pezzi.join('/')}(?=$|[?#]|\`)`);
}

const rotte = rotteDaCartella(APP).sort();
// La radice è la pagina di login: è il punto di ingresso del prodotto, non una
// pagina da raggiungere.
const senzaPorta = [];
// Un percorso può comparire in più file: conta se ALMENO UNO è fuori dalla
// rotta. Tenere solo il primo file (spesso un layout interno) faceva sembrare
// orfane pagine che avevano una porta altrove.
const riferimenti = new Map(); // percorso normalizzato -> file che lo citano

for (const file of fileSorgente(RADICE)) {
  for (const percorso of porteDelFile(file)) {
    if (!riferimenti.has(percorso)) riferimenti.set(percorso, []);
    riferimenti.get(percorso).push(file);
  }
}

for (const rotta of rotte) {
  if (rotta === '/') continue;
  const espressione = espressioneRotta(rotta);
  const cartellaRotta = path.join(APP, ...rotta.split('/').filter(Boolean));
  let porta = null;
  for (const [percorso, files] of riferimenti) {
    if (!espressione.test(percorso)) continue;
    // Un link scritto dentro la rotta stessa (o nelle sue sotto-pagine) non è
    // una porta: non porta dentro da fuori.
    const esterno = files.find((f) => !f.startsWith(cartellaRotta + path.sep));
    if (esterno) {
      porta = { percorso, file: esterno };
      break;
    }
  }
  if (!porta) senzaPorta.push(rotta);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const note = baseline.senzaPorta ?? {};
const nuove = senzaPorta.filter((r) => !(r in note));
const chiuse = Object.keys(note).filter((r) => !senzaPorta.includes(r));

console.log(`Rotte con una porta in ingresso: ${rotte.length - 1 - senzaPorta.length}/${rotte.length - 1}.`);
if (senzaPorta.length) {
  console.log('\nRotte senza porta (vive solo per un segnalibro):');
  for (const rotta of senzaPorta) {
    console.log(`  · ${rotta}${note[rotta] ? ` — ${note[rotta]}` : ''}`);
  }
}

if (SOLO_ELENCO) process.exit(0);

if (chiuse.length) {
  console.log(
    `\nDa togliere da ${BASELINE} (ora hanno una porta):\n  ` + chiuse.join('\n  ')
  );
}

if (nuove.length) {
  console.error(
    '\nERRORE: rotte nuove senza una porta in ingresso:\n  ' +
      nuove.join('\n  ') +
      '\n\nAprile da un link, da un redirect o dalla sidebar. Se la pagina deve restare\n' +
      'raggiungibile solo per URL (rimando per segnalibri, rotta di servizio),\n' +
      'motivala in scripts/porte-rotte.json.'
  );
  process.exit(1);
}

console.log('\nOK: nessuna rotta orfana nuova.');
