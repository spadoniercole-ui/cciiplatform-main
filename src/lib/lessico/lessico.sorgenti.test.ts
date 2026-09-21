// SORVEGLIANZA DEL LESSICO NEI TESTI DELL'APPLICATIVO.
//
// Fallisce se uno dei termini vietati senza usi innocenti (ricevibile,
// ammissibile, solido, pavimento minimo, omologabile, segnalazione dovuta)
// ricompare in un testo a schermo, in un prompt per l'AI o in un PDF.
// I commenti e i nomi interni (tabelle, tipi, proprieta') non contano: nessun
// utente li legge, e rinominarli sarebbe una migrazione senza beneficio.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cercaTerminiLessico } from './lessico';

const RADICE = join(__dirname, '..', '..');

/** File esclusi, ciascuno con il suo perche'. */
const ESENTI: Record<string, string> = {
  'lib/lessico/lessico.ts': 'È il lessico stesso: elenca i termini per riconoscerli.',
  'lib/normativa/dati.ts': 'Testo e parafrasi di norme: citazione della fonte, ammessa da Libra.',
  'lib/registroFonti/fonti.ts': 'Schede delle fonti: riportano il contenuto delle norme.',
};

function elencaSorgenti(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) return elencaSorgenti(p);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [p] : [];
  });
}

function senzaCommenti(sorgente: string): string {
  const vuoto = (m: string) => m.replace(/[^\n]/g, ' ');
  return sorgente
    .replace(/\/\*[\s\S]*?\*\//g, vuoto)
    .replace(
      /(^|[^:'"`\\])\/\/[^\n]*/g,
      (m, prima: string) => prima + vuoto(m.slice(prima.length))
    );
}

/** Il termine e' dentro un nome interno (proprieta', chiave, identificativo)? */
function eNomeInterno(riga: string, inizio: number, fine: number): boolean {
  const prima = riga[inizio - 1] ?? '';
  const dopo = riga[fine] ?? '';
  if (prima === '.' || prima === '_' || dopo === '_') return true;
  // chiave di oggetto o di tipo: `ricevibile: true`, `ricevibile?: boolean`
  if (/(^|[{,(])\s*$/.test(riga.slice(0, inizio)) && /^\??:/.test(riga.slice(fine))) return true;
  // identificativo fra apici: 'ricevibile'
  if (/['"`]/.test(prima) && prima === dopo) return true;
  return false;
}

describe('i testi dell’applicativo rispettano il lessico controllato', () => {
  it('nessun termine vietato a schermo, nei prompt o nei PDF', () => {
    const violazioni: string[] = [];
    for (const file of elencaSorgenti(RADICE)) {
      const rel = relative(RADICE, file).replace(/\\/g, '/');
      if (ESENTI[rel]) continue;
      const righe = senzaCommenti(readFileSync(file, 'utf-8')).split('\n');
      righe.forEach((riga, i) => {
        for (const r of cercaTerminiLessico(riga, { soloSorvegliati: true })) {
          if (eNomeInterno(riga, r.posizione, r.posizione + r.trovato.length)) continue;
          violazioni.push(`${rel}:${i + 1}  «${r.trovato}» [${r.voce.id}]  …${r.contesto}…`);
        }
      });
    }
    expect(violazioni, `\n${violazioni.join('\n')}\n`).toEqual([]);
  });
});
