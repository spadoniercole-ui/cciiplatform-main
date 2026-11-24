// src/lib/iai/esitoHtml.ts
//
// LA PRIMA PAGINA del documento della verifica: l'esito (semaforo, accertato,
// da accertare, copertura) e le cinque dimensioni che lo spiegano. Stesso
// contenuto della schermata: ciò che si stampa è ciò che si vede.
//
// Il quadrante dell'IAI e la sua fascia non ci sono più: erano un secondo
// giudizio sulla stessa posizione.

import { DICHIARAZIONE_DIMENSIONI, NOME_DIMENSIONE } from './dimensioni';
import type { EsitoVerifica } from '@/lib/verifica/esito';
import type { DebitoInBilancio } from '@/lib/verifica/debitoInBilancio';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STILE = {
  ROSSO: { colore: '#dc2626', fondo: '#fef2f2', parola: 'Attenzione alta' },
  GIALLO: { colore: '#d97706', fondo: '#fffbeb', parola: 'Attenzione' },
  ATTENZIONE_MINIMA: { colore: '#059669', fondo: '#ecfdf5', parola: 'Attenzione contenuta' },
} as const;

// LA RIGA DEL DEBITO IN BILANCIO (0.256.5). Stessa informazione della
// schermata, con lo stesso colore: un documento che tace ciò che la pagina
// dice è un documento che chi lo legge crede completo.
function rigaDebitoHtml(d: DebitoInBilancio): string {
  const colore = d.stato === 'NON_CONTABILIZZATO' ? '#b91c1c' : d.segnala ? '#b45309' : '#334155';
  const titolo =
    d.stato === 'NON_CONTABILIZZATO'
      ? 'Debito verso l’ente non contabilizzato in bilancio'
      : d.stato === 'CONTABILIZZATO' && !d.segnala
        ? 'Debito verso l’ente contabilizzato in bilancio'
        : 'Debito verso l’ente: la verifica in bilancio non è possibile';
  const importo =
    d.esposizione !== null
      ? ` Debito accertato: <strong style="color:${colore}">${Math.round(
          d.esposizione
        ).toLocaleString('it-IT')} €</strong>.`
      : '';
  return `<p class="dich" style="color:${colore}"><strong>${esc(titolo)}</strong> ${esc(
    d.testo
  )}${importo}</p>`;
}

export function htmlCopertinaEsito(
  esito: EsitoVerifica,
  intestazione: {
    azienda: string;
    codiceFiscale: string | null;
    ente: string;
    data: string;
    /** Identificativi presso l'ente (matricola, posizioni…): il riconoscimento aziendale. */
    identificativi?: { etichetta: string; valore: string }[];
  },
  /** Il debito dell’ente ritrovato o no in bilancio (0.256.5). */
  debitoInBilancio?: DebitoInBilancio | null
): string {
  const ident = intestazione.identificativi?.length
    ? `<p class="ident">${intestazione.identificativi
        .map((x) => `<span><b>${esc(x.etichetta)}</b> ${esc(x.valore)}</span>`)
        .join('')}</p>`
    : '';
  const g = esito.giudizio;
  const s = STILE[g.esito];
  const elenco = (voci: string[], vuoto: string) =>
    voci.length
      ? `<ul>${voci.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
      : `<p class="muto">${esc(vuoto)}</p>`;

  const dimensioni = esito.dimensioni
    .map(
      (c) => `<tr>
  <td style="width:40%;padding:4px 6px;font-size:11px"><b>${c.dimensione}</b> · ${esc(NOME_DIMENSIONE[c.dimensione])}</td>
  <td style="padding:4px 6px"><div style="height:9px;background:#f1f5f9;border-radius:5px"><div style="height:9px;width:${c.punteggio}%;background:#2563eb;opacity:.7;border-radius:5px"></div></div></td>
  <td style="width:48%;padding:4px 6px;font-size:10px;line-height:1.35">${
    c.motivi.length
      ? c.motivi.map((m) => esc(m)).join('; ')
      : '<span style="color:#94a3b8">nessun determinante</span>'
  }${c.lacune.length ? `<br><span style="color:#92400e">lacuna: ${c.lacune.map((l) => esc(l)).join('; ')}</span>` : ''}</td>
</tr>`
    )
    .join('');

  return `<style>
  .cop h2{font-size:13px;margin:14px 0 4px;color:#0f172a}
  .cop .esito{border:1px solid ${s.colore}33;background:${s.fondo};border-radius:6px;padding:12px 14px;margin-top:10px}
  .cop .classe{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:2px 7px;border-radius:3px;background:${s.colore}1f;color:${s.colore}}
  .cop .titolo{font-size:15px;font-weight:700;color:#0f172a;margin:6px 0 2px}
  .cop .fattore{font-size:11px;color:#334155;margin:0}
  .cop .copertura{font-size:10px;color:#64748b;margin:4px 0 0}
  .cop .due{display:flex;gap:18px;margin-top:10px;border-top:1px solid ${s.colore}22;padding-top:8px}
  .cop .due>div{flex:1}
  .cop .due h3{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin:0 0 4px}
  .cop ul{margin:0 0 0 14px;padding:0}
  .cop li{font-size:10px;line-height:1.4;color:#334155;margin:2px 0}
  .cop table{width:100%;border-collapse:collapse;margin-top:4px}
  .cop .muto{font-size:10px;color:#94a3b8;margin:0}
  .cop .dich{font-size:9px;color:#64748b;font-style:italic;margin-top:12px;line-height:1.4}
  .cop .meta{font-size:11px;color:#475569;margin:0}
  .cop .ident{font-size:11px;color:#0f172a;margin:2px 0 0;display:flex;flex-wrap:wrap;gap:4px 14px}
</style>
<div class="cop">
  <p class="meta">${esc(intestazione.azienda)}${intestazione.codiceFiscale ? ` — C.F. ${esc(intestazione.codiceFiscale)}` : ''} · ${esc(intestazione.ente)} · calcolato il ${esc(intestazione.data)}</p>
  ${ident}

  <div class="esito">
    <span class="classe">${esc(s.parola)}</span>
    <p class="titolo">${esc(g.etichetta)}</p>
    <p class="fattore">${esc(g.fattoreDeterminante)}</p>
    <p class="copertura">Copertura informativa: ${g.copertura.determinate} dimensioni su ${g.copertura.totali}${
      g.copertura.determinate < g.copertura.totali
        ? ' — il giudizio è limitato ai dati disponibili'
        : ''
    }.</p>
    <div class="due">
      <div><h3>Accertato</h3>${elenco(g.accertato, 'Nessun elemento accertato.')}</div>
      <div><h3>Da accertare</h3>${elenco(g.daAccertare, 'Nulla da integrare.')}</div>
    </div>
  </div>

  <h2>Dove si concentra l’attenzione</h2>
  ${debitoInBilancio ? rigaDebitoHtml(debitoInBilancio) : ''}
  <p class="muto">Cinque dimensioni: spiegano l’esito, non lo sostituiscono. Nessun punteggio complessivo.</p>
  <table>${dimensioni}</table>
  <p class="dich">${esc(DICHIARAZIONE_DIMENSIONI)}</p>
</div>`;
}
