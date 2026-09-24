// src/lib/iai/notaHtml.ts
//
// La NOTA METODOLOGICA in HTML: pesi con quota, vincoli, fasce, basi. Stessa
// funzione per la stampa a parte (Parametri di Spazio) e per l'allegato in
// coda al PDF dello Screening (flag dell'ente, attivo per default).

import {
  BASI_METODOLOGICHE_IAI,
  NOME_DIMENSIONE,
  NOME_VINCOLO,
  type Dimensione,
  type ParametriIai,
} from './indice';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const DESCRIZIONE_DIMENSIONE: Record<Dimensione, string> = {
  A: 'presupposti dell’art. 25-novies, V.E.R.A., importi non noti, denunce Uniemens',
  B: 'Z’’-score di Altman, patrimonio netto su debiti, EBITDA su ricavi',
  C: 'variazione di ricavi, risultato e patrimonio netto sull’esercizio precedente',
  D: 'quota di dati dichiarati dall’azienda, importi non noti, bilancio non disaggregato, esiti non esprimibili',
  E: 'procedura concorsuale pendente, stato dell’attività, capitale sotto il minimo, età della visura',
};

export function htmlNotaMetodologica(p: ParametriIai, personalizzati: boolean): string {
  const somma = (Object.values(p.pesi) as number[]).reduce((s, x) => s + x, 0);
  const righe = (Object.keys(p.pesi) as Dimensione[])
    .map(
      (d) =>
        `<tr><td><b>${d}</b> · ${esc(NOME_DIMENSIONE[d])}</td><td class="num">${p.pesi[d]}</td><td class="num">${somma ? Math.round((p.pesi[d] / somma) * 100) : 0}%</td><td>${esc(DESCRIZIONE_DIMENSIONE[d])}</td></tr>`
    )
    .join('');
  const vincoli = (Object.keys(p.vincoli) as (keyof ParametriIai['vincoli'])[])
    .map((k) => `<tr><td>${esc(NOME_VINCOLO[k])}</td><td class="num">${p.vincoli[k]}</td></tr>`)
    .join('');
  const fasce = p.fasce
    .map(
      (f, i) =>
        `<tr><td>${i === 0 ? 0 : p.fasce[i - 1].fine + 1}–${f.fine}</td><td>${esc(f.nome)}</td><td>${esc(f.lettura)}</td></tr>`
    )
    .join('');
  const basi = BASI_METODOLOGICHE_IAI.map(
    (b) => `<li>${esc(b.rif)} <em>— ${esc(b.uso)}</em></li>`
  ).join('');
  return `<h2 style="font-size:14px">Nota metodologica — Indice di Attenzione Istruttoria</h2>
<p class="note">Parametri ${personalizzati ? 'definiti dall’ente' : 'predefiniti'} per questo spazio. Indice composito 0-100: normalizzazione per distanza dall’obiettivo, media ponderata con vincoli di non compensabilità.</p>
<h3 style="font-size:12px">Pesi delle dimensioni</h3>
<table><thead><tr><th>Dimensione</th><th>Peso</th><th>Quota</th><th>Che cosa misura</th></tr></thead><tbody>${righe}</tbody></table>
<h3 style="font-size:12px">Vincoli di non compensabilità (minimo dell’indice)</h3>
<table><thead><tr><th>Vincolo</th><th>Minimo</th></tr></thead><tbody>${vincoli}</tbody></table>
<h3 style="font-size:12px">Fasce</h3>
<table><thead><tr><th>Intervallo</th><th>Fascia</th><th>Lettura</th></tr></thead><tbody>${fasce}</tbody></table>
<h3 style="font-size:12px">Basi metodologiche</h3><ul>${basi}</ul>`;
}
