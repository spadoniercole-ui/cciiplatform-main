// src/lib/iai/riferimentiHtml.ts
//
// «RIFERIMENTI E METODO» — l'allegato unico in coda a ogni PDF (scelta di
// Ercole): perimetro, documenti di origine con impronta, fonti normative dal
// registro, titoli dell'ente, parametri dell'indice, basi metodologiche,
// rilievi residui della revisione. Cosi' ogni affermazione ha la sua fonte
// identificata in un posto solo, e la copertina resta pulita.
//
// Logica pura: riceve i dati raccolti dalle azioni e produce HTML.

import { FONTI, type Fonte } from '@/lib/registroFonti/fonti';
import { riscontraCitazioni } from '@/lib/registroFonti/citazioni';
import { dichiarazionePerimetro, type FaseElaborato } from '@/lib/revisore/perimetro';
import { appendiceRilievi } from '@/lib/revisore/correzione';
import type { Revisione } from '@/lib/revisore/revisore';
import { htmlNotaMetodologica } from './notaHtml';
import { BASI_METODOLOGICHE_IAI, RIFERIMENTI_NORMATIVI_IAI, type ParametriIai } from './indice';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface DocumentoRiferimento {
  tipo: string;
  nomeFile: string;
  impronta: string;
  caricatoIl: string | null;
}
export interface MateriaRiferimento {
  nome: string;
  presupposto: string | null;
  riferimenti: string | null;
  confermataDa: string | null;
  confermataIl: string | null;
  codici: string[];
}

export interface DatiRiferimenti {
  fase: FaseElaborato;
  documenti: DocumentoRiferimento[];
  /** Identificativi delle fonti del registro usate dal motore (soglie, regole). */
  fontiUsate: string[];
  /** Testo dell'elaborato: le citazioni si riscontrano sul registro. */
  testo: string;
  materie: MateriaRiferimento[];
  parametriIai: ParametriIai | null;
  parametriPersonalizzati: boolean;
  revisione: Revisione | null;
}

const ETICHETTA_TIPO_DOC: Record<string, string> = {
  VISURA: 'Visura camerale',
  XBRL: 'Bilancio XBRL',
  POSIZIONE_ENTE: 'File dell’ente (posizione debitoria)',
  VERA: 'Posizione V.E.R.A.',
  PROPOSTA: 'Excel della proposta',
};

function rigaFonte(f: Fonte, dimensione?: string): string {
  return `<tr><td><code>${esc(f.id)}</code></td><td>${esc(f.norma)}${dimensione ? ` <span class="dim">(${esc(dimensione)})</span>` : ''}</td><td>${esc(f.stato)}${f.verificata ? '' : ' — non riscontrata'}</td><td>${esc(f.verifica)}</td></tr>`;
}

export function htmlRiferimentiEMetodo(d: DatiRiferimenti): string {
  const parti: string[] = [];
  parti.push(`<h2 style="font-size:14px">Riferimenti e metodo</h2>`);

  // 1. Perimetro
  parti.push(
    `<h3 style="font-size:12px">1. Perimetro e destinazione</h3><p style="white-space:pre-wrap;font-size:10px">${esc(dichiarazionePerimetro(d.fase))}</p>`
  );

  // 2. Documenti di origine
  parti.push(`<h3 style="font-size:12px">2. Documenti di origine</h3>`);
  if (d.documenti.length === 0)
    parti.push(`<p class="note">Nessun documento registrato con impronta.</p>`);
  else
    parti.push(
      `<table><thead><tr><th>Tipo</th><th>File</th><th>Impronta SHA-256 (prime 12 cifre)</th><th>Caricato il</th></tr></thead><tbody>${d.documenti
        .map(
          (x) =>
            `<tr><td>${esc(ETICHETTA_TIPO_DOC[x.tipo] ?? x.tipo)}</td><td>${esc(x.nomeFile)}</td><td><code>${esc(x.impronta.slice(0, 12))}…</code></td><td>${x.caricatoIl ? esc(new Date(x.caricatoIl).toLocaleDateString('it-IT')) : '—'}</td></tr>`
        )
        .join(
          ''
        )}</tbody></table><p class="note">L’impronta intera è consultabile nell’applicativo, nel fascicolo di evidenza.</p>`
    );

  // 3. Fonti normative
  const ids = new Set<string>(d.fontiUsate);
  const cit = riscontraCitazioni(d.testo);
  for (const r of cit.riscontrate) ids.add(r.fonte.id);
  for (const r of cit.nonSostenibili) ids.add(r.fonte.id);
  const dimensionePerRif = new Map<string, string>();
  for (const r of RIFERIMENTI_NORMATIVI_IAI) dimensionePerRif.set(r.rif, r.dimensione);
  const fontiRighe = Array.from(ids)
    .map((id) => FONTI.find((f) => f.id === id))
    .filter((f): f is Fonte => !!f)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f) => rigaFonte(f))
    .join('');
  const perDimensione = RIFERIMENTI_NORMATIVI_IAI.map(
    (r) => `<li><b>${r.dimensione}</b> · ${esc(r.rif)}</li>`
  ).join('');
  parti.push(
    `<h3 style="font-size:12px">3. Fonti normative</h3>` +
      (fontiRighe
        ? `<table><thead><tr><th>Id</th><th>Fonte</th><th>Stato</th><th>Verifica</th></tr></thead><tbody>${fontiRighe}</tbody></table>`
        : `<p class="note">Nessuna fonte del registro richiamata dal motore o dal testo.</p>`) +
      (d.parametriIai
        ? `<p class="note">Riferimenti per dimensione dell’indice:</p><ul style="font-size:10px">${perDimensione}</ul>`
        : '') +
      (cit.nonInRegistro.length
        ? `<p class="note">Riferimenti citati nel testo e non presenti nel registro delle fonti (non verificati): ${cit.nonInRegistro.map((c) => esc(c.testo)).join('; ')}.</p>`
        : '')
  );

  // 4. Titoli dell'ente
  if (d.materie.length) {
    parti.push(
      `<h3 style="font-size:12px">4. Titoli di credito dell’ente (materie)</h3><table><thead><tr><th>Materia</th><th>Presupposto giuridico</th><th>Riferimenti interni</th><th>Codici</th><th>Conferma</th></tr></thead><tbody>${d.materie
        .map(
          (m) =>
            `<tr><td>${esc(m.nome)}</td><td>${esc(m.presupposto ?? 'da indicare')}</td><td>${esc(m.riferimenti ?? '—')}</td><td>${esc(m.codici.join(', ') || '—')}</td><td>${m.confermataDa ? `${esc(m.confermataDa)}${m.confermataIl ? ` il ${esc(new Date(m.confermataIl).toLocaleDateString('it-IT'))}` : ''}` : 'non confermata'}</td></tr>`
        )
        .join('')}</tbody></table>`
    );
  }

  // 5-6. Indice e basi
  if (d.parametriIai)
    parti.push(
      htmlNotaMetodologica(d.parametriIai, d.parametriPersonalizzati).replace(
        'Nota metodologica — Indice di Attenzione Istruttoria',
        '5. Indice di Attenzione Istruttoria — parametri e metodo'
      )
    );
  else
    parti.push(
      `<h3 style="font-size:12px">5. Basi metodologiche</h3><ul style="font-size:10px">${BASI_METODOLOGICHE_IAI.map((b) => `<li>${esc(b.rif)} <em>— ${esc(b.uso)}</em></li>`).join('')}</ul>`
    );

  // 7. Revisione
  if (d.revisione) {
    const app = appendiceRilievi(d.revisione).trim();
    parti.push(
      `<h3 style="font-size:12px">6. Revisione automatica</h3><p class="note">Controlli eseguiti: ${d.revisione.conteggi.PASS + d.revisione.conteggi.CORREZIONE_AUTOMATICA + d.revisione.conteggi.SEGNALAZIONE + d.revisione.conteggi.BLOCCO} su ${d.revisione.risultati.length}; ${d.revisione.conteggi.NON_VERIFICATO} non eseguibili automaticamente, a carico della revisione professionale.</p>` +
        (app
          ? `<p style="white-space:pre-wrap;font-size:10px">${esc(app)}</p>`
          : `<p class="note">Nessun rilievo residuo.</p>`)
    );
  }
  return parti.join('\n');
}
