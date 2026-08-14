// portable/build-portable.mjs
//
// Assembla l'edizione PORTABLE (Windows, raw): esegue `next build` in
// modalità standalone e compone la cartella `portable-dist/` pronta da
// copiare su chiavetta. Uso: `npm run build:portable`.
//
// La cartella prodotta contiene server.js autoconsistente + gli asset;
// manca solo il Node per Windows, che va messo in `portable-dist\node\`
// (node.exe) — vedi README-PORTABLE.txt.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'portable-dist');

function log(m) {
  console.log('\n▶ ' + m);
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

log('1/5 — next build (PORTABLE=1, output standalone)');
// NEXT_PUBLIC_PORTABLE=1 viene inlinato nel bundle client: fa mostrare
// alla barra di stato "Portable vX.Y.Z" invece della versione cloud.
execSync('next build', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PORTABLE: '1', NEXT_PUBLIC_PORTABLE: '1' },
});

log('2/5 — pulizia e copia del bundle standalone');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyDir(path.join(ROOT, '.next', 'standalone'), OUT);

log('3/5 — copia asset statici e public (necessari accanto a server.js)');
copyDir(path.join(ROOT, '.next', 'static'), path.join(OUT, '.next', 'static'));
if (fs.existsSync(path.join(ROOT, 'public')))
  copyDir(path.join(ROOT, 'public'), path.join(OUT, 'public'));

log('4/5 — pacchetti runtime esterni (PGlite completo + drizzle-orm/pglite)');
const pgSrc = path.join(ROOT, 'node_modules', '@electric-sql', 'pglite');
const pgDst = path.join(OUT, 'node_modules', '@electric-sql', 'pglite');
if (fs.existsSync(pgSrc)) {
  fs.rmSync(pgDst, { recursive: true, force: true });
  copyDir(pgSrc, pgDst);
} else {
  console.warn('  ! PGlite non trovato: esegui npm install prima del build.');
}
// Il driver drizzle-orm/pglite è importato dinamicamente: assicurane la presenza.
const drzPgSrc = path.join(ROOT, 'node_modules', 'drizzle-orm', 'pglite');
const drzPgDst = path.join(OUT, 'node_modules', 'drizzle-orm', 'pglite');
if (fs.existsSync(drzPgSrc) && !fs.existsSync(drzPgDst)) copyDir(drzPgSrc, drzPgDst);

// Rimuovi i binari nativi di sharp (per-OS): con images.unoptimized non
// servono, e la loro rimozione rende il pacchetto indipendente dall'OS.
const imgDir = path.join(OUT, 'node_modules', '@img');
if (fs.existsSync(imgDir)) fs.rmSync(imgDir, { recursive: true, force: true });

log('5/5 — launcher, configurazione e istruzioni');
copyDir(path.join(ROOT, 'portable', 'template'), OUT);
fs.mkdirSync(path.join(OUT, 'dati'), { recursive: true });

console.log('\n✅ Fatto. Cartella pronta: ' + OUT);
console.log(
  '   Passi finali: metti node.exe (Windows) in portable-dist\\node\\ e copia la cartella su chiavetta.'
);
