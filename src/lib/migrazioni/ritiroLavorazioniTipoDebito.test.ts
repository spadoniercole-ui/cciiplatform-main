import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// IL RITIRO DELLA TABELLA STORICA, TENUTO FERMO DA UN TEST.
//
// La tabella delle lavorazioni per tipologia di debito è stata congelata nella
// 0.138.x e svuotata di ruolo nella 0.156.0: le TL vivono nel catalogo, e la
// tabella si legge solo per migrarle. Un test che lo dice è più utile di una
// convenzione: una lettura reintrodotta per comodità (un `SELECT` aggiunto in
// un'azione) riporterebbe in vita una configurazione che nessuno scrive più, e
// senza questo controllo se ne accorgerebbe solo chi indaga su un destinatario
// sbagliato.
//
// L'elenco ammesso è di due file — la migrazione e il test che la prova: chi
// aggiunge una lettura deve dirlo qui, e quindi leggere
// `docs/RITIRO-LAVORAZIONI-TIPO-DEBITO.md` prima.

const RADICE = join(process.cwd(), 'src');
// Il nome si compone: così questo file non conta come lettore di se stesso.
const TABELLA = ['lavorazioni', 'tipo', 'debito'].join('_');
// La migrazione, e il test end-to-end che ricostruisce uno spazio configurato
// con la tabella vera: lì il nome serve a creare il caso, non a leggerlo.
const AMMESSI = [
  'src/app/actions/lavorazioniTipoDebito.migrazione.test.ts',
  'src/lib/migrazioni/catalogoTlDb.ts',
];

function fileSorgente(dir: string): string[] {
  const trovati: string[] = [];
  for (const voce of readdirSync(dir)) {
    const percorso = join(dir, voce);
    if (statSync(percorso).isDirectory()) {
      trovati.push(...fileSorgente(percorso));
      continue;
    }
    if (/\.(ts|tsx)$/.test(voce)) trovati.push(percorso);
  }
  return trovati;
}

function lettori(): string[] {
  return fileSorgente(RADICE)
    .filter((percorso) => readFileSync(percorso, 'utf8').includes(TABELLA))
    .map((percorso) => relative(process.cwd(), percorso).replace(/\\/g, '/'))
    .sort();
}

describe('tabella storica delle lavorazioni per tipologia di debito', () => {
  it('è letta solo dalla migrazione verso il catalogo delle TL', () => {
    expect(lettori()).toEqual(AMMESSI);
  });

  it('non è più esportata con la configurazione dello spazio', () => {
    const configurazione = readFileSync(
      join(RADICE, 'lib/configurazioneSpazio/configurazione.ts'),
      'utf8'
    );
    expect(configurazione).not.toContain(`nome: '${TABELLA}'`);
    expect(configurazione).toContain("nome: 'catalogo_tl'");
  });

  it('non viene più creata dal provisioning: gli spazi nuovi non la ricevono', () => {
    const provision = readFileSync(join(RADICE, 'db/provision.ts'), 'utf8');
    expect(provision).not.toContain(TABELLA);
  });
});
