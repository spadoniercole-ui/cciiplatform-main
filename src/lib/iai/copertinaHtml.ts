// src/lib/iai/copertinaHtml.ts
//
// La COPERTINA in HTML, per la stampa: quadrante, barre, vincoli, sintesi,
// basi metodologiche e riferimenti normativi. Stesso motore della
// schermata: cio' che si stampa e' cio' che si vede.

import { DICHIARAZIONE_IAI, NOME_DIMENSIONE, type EsitoIai } from './indice';

const COLORI = ['#059669', '#d97706', '#ea580c', '#dc2626'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function quadranteSvg(valore: number, colore: string): string {
  const angolo = Math.PI - (valore / 100) * Math.PI;
  const x = (100 + 80 * Math.cos(angolo)).toFixed(1);
  const y = (100 - 80 * Math.sin(angolo)).toFixed(1);
  const grande = valore > 50 ? 1 : 0;
  return `<svg viewBox="0 0 200 115" width="220" height="126" xmlns="http://www.w3.org/2000/svg">
  <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e2e8f0" stroke-width="14" stroke-linecap="round"/>
  ${valore > 0 ? `<path d="M 20 100 A 80 80 0 ${grande} 1 ${x} ${y}" fill="none" stroke="${colore}" stroke-width="14" stroke-linecap="round"/>` : ''}
  <text x="100" y="92" text-anchor="middle" font-size="34" font-weight="700" fill="#0f172a" font-family="sans-serif">${valore}</text>
  <text x="100" y="110" text-anchor="middle" font-size="10" fill="#64748b" font-family="sans-serif">IAI su 100</text>
</svg>`;
}

export function htmlCopertinaIai(
  esito: EsitoIai,
  intestazione: { azienda: string; codiceFiscale: string | null; ente: string; data: string }
): string {
  const colore = COLORI[esito.fascia.indiceFascia] ?? COLORI[3];
  const barre = esito.componenti
    .map((c) => {
      const col =
        c.punteggio > 75
          ? COLORI[3]
          : c.punteggio > 55
            ? COLORI[2]
            : c.punteggio > 30
              ? COLORI[1]
              : COLORI[0];
      return `<tr>
  <td style="width:44%;padding:4px 6px;font-size:11px"><b>${c.dimensione}</b> · ${esc(NOME_DIMENSIONE[c.dimensione])}</td>
  <td style="padding:4px 6px"><div style="height:10px;background:#f1f5f9;border-radius:5px"><div style="height:10px;width:${c.punteggio}%;background:${col};border-radius:5px"></div></div></td>
  <td style="width:36px;text-align:right;font-weight:700;font-size:12px">${c.punteggio}</td>
</tr>`;
    })
    .join('');
  const vincoli = esito.vincoliScattati.length
    ? `<ul class="vincoli">${esito.vincoliScattati.map((v) => `<li>Vincolo: ${esc(v.nome)} — l’indice non scende sotto ${v.minimo}, qualunque sia il resto.</li>`).join('')}</ul>`
    : '';
  const dettaglio = esito.componenti
    .map(
      (c) =>
        `<div class="dim"><b>${c.dimensione} · ${esc(NOME_DIMENSIONE[c.dimensione])} — ${c.punteggio}</b>${
          c.motivi.length ? `<ul>${c.motivi.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''
        }${c.lacune.length ? `<ul class="lacune">${c.lacune.map((l) => `<li>lacuna: ${esc(l)}</li>`).join('')}</ul>` : ''}${
          !c.motivi.length && !c.lacune.length ? '<p class="muto">Nessun determinante.</p>' : ''
        }</div>`
    )
    .join('');

  return `<style>
  .cop h2{font-size:15px;margin:18px 0 6px;color:#0f172a}
  .cop .testa{display:flex;gap:24px;align-items:flex-start;margin-top:8px}
  .cop .fascia{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border-radius:4px;background:${colore}22;color:${colore};margin-top:4px}
  .cop .lettura{font-size:11px;color:#475569;max-width:220px;margin-top:6px}
  .cop table{width:100%;border-collapse:collapse}
  .cop .vincoli li{font-size:11px;color:#991b1b;margin:3px 0}
  .cop .sintesi{white-space:pre-wrap;font-size:12px;line-height:1.5;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-top:10px}
  .cop .dim{border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin:6px 0;font-size:11px}
  .cop .dim ul{margin:4px 0 0 16px;padding:0}
  .cop .lacune li{color:#92400e}
  .cop .muto{color:#94a3b8;margin:4px 0 0}
  .cop .basi li{font-size:10px;color:#334155;margin:4px 0}
  .cop .uso{color:#64748b}
  .cop .dich{font-size:10px;color:#64748b;font-style:italic;margin-top:10px}
  .cop .meta{font-size:11px;color:#475569}
</style>
<div class="cop">
  <p class="meta">${esc(intestazione.azienda)}${intestazione.codiceFiscale ? ` — C.F. ${esc(intestazione.codiceFiscale)}` : ''} · ${esc(intestazione.ente)} · calcolato il ${esc(intestazione.data)}</p>
  <div class="testa">
    <div style="text-align:center">${quadranteSvg(esito.indice, colore)}<br><span class="fascia">${esc(esito.fascia.nome)}</span><p class="lettura">${esc(esito.fascia.lettura)}</p></div>
    <div style="flex:1"><table>${barre}</table>${vincoli}</div>
  </div>
  <div class="sintesi">${esc(esito.sintesi)}</div>
  <h2>Determinanti e lacune per dimensione</h2>
  ${dettaglio}
  <p class="note">Riferimenti normativi, documenti di origine, titoli dell’ente e metodo: nell’allegato «Riferimenti e metodo» in coda al documento.</p>
  <p class="dich">${esc(DICHIARAZIONE_IAI)}</p>
</div>`;
}
