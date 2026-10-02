// src/lib/triage/riepilogoHtml.ts
//
// RIEPILOGO DEL TRIAGE in HTML, per la stampa in PDF: quali documenti sono
// stati caricati e letti, cosa se ne è ricavato, con quali valori si sono
// misurate le soglie e quale indicazione ne viene. È ciò che si consegna al
// responsabile di turno: il risultato a video non basta, perché non resta.
//
// Logica pura: riceve i dati già calcolati dalla pagina, non ricalcola nulla.

import type { Attenzione } from '@/lib/screening/indicatore';

export interface DocumentoTriage {
  nome: string;
  /** Natura riconosciuta dalle intestazioni (o dichiarata: visura, XBRL). */
  tipo: string;
  /** Usato nel calcolo, oppure il motivo per cui non lo è stato. */
  esito: string;
}

export interface ValoriTriage {
  conLavoratori: boolean | null;
  annoPrecedente: number;
  contributiDovutiAnnoPrecedente: number | null;
  nonVersatoOltre90: number | null;
  ritardoOltre90Giorni: boolean | null;
  periodiInRitardo: number | null;
  /** null = Elenco denunce non letto; '' = letto, nessuna mancante. */
  denunceNonPresentate: string | null;
  creditiAffidatiAgente: number | null;
}

export interface DatiRiepilogoTriage {
  azienda: string;
  codiceFiscale: string | null;
  partitaIva: string | null;
  sede: string | null;
  dataVerifica: string; // AAAA-MM-GG
  perimetro: string;
  documenti: DocumentoTriage[];
  note: string[];
  valori: ValoriTriage;
  attenzione: Attenzione | null;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const euro = (n: number | null) =>
  n === null
    ? '<i>non rilevato</i>'
    : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })} €`;
const sino = (b: boolean | null, si: string, no: string) =>
  b === null ? '<i>non determinabile con i documenti caricati</i>' : b ? si : no;
const data = (iso: string) => iso.split('-').reverse().join('/');

export function htmlRiepilogoTriage(d: DatiRiepilogoTriage): string {
  const v = d.valori;
  const parti: string[] = [];

  parti.push(`<style>
  .rt h2{font-size:14px;margin:18px 0 6px}
  .rt .meta{font-size:12px;color:#334155}
  .rt .perimetro{white-space:pre-wrap;font-size:10px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px}
  .rt ul{margin:4px 0 0 18px;padding:0}
  .rt li{font-size:11px;margin:3px 0}
  .rt .esito{font-size:13px;font-weight:700}
  .rt .lacune li{color:#92400e}
</style>`);
  parti.push('<div class="rt">');
  parti.push(
    `<p class="meta"><b>${esc(d.azienda)}</b>${d.codiceFiscale ? ` — C.F. ${esc(d.codiceFiscale)}` : ''}${
      d.partitaIva && d.partitaIva !== d.codiceFiscale ? ` — P.IVA ${esc(d.partitaIva)}` : ''
    }${d.sede ? `<br>${esc(d.sede)}` : ''}<br>Verifica riferita al <b>${data(d.dataVerifica)}</b></p>`
  );

  // 1. Esito
  parti.push('<h2>1. Indicazione del triage</h2>');
  if (d.attenzione) {
    const a = d.attenzione;
    parti.push(
      `<p class="esito">${esc(a.etichetta)}</p><p style="font-size:11px">Fattore determinante: ${esc(
        a.fattoreDeterminante
      )} — dimensioni determinate ${a.copertura.determinate} su ${a.copertura.totali}.</p>`
    );
    if (a.accertato.length)
      parti.push(
        `<p style="font-size:11px;margin-bottom:0"><b>Accertato dai documenti</b></p><ul>${a.accertato
          .map((x) => `<li>${esc(x)}</li>`)
          .join('')}</ul>`
      );
    if (a.daAccertare.length)
      parti.push(
        `<p style="font-size:11px;margin-bottom:0"><b>Da accertare</b></p><ul class="lacune">${a.daAccertare
          .map((x) => `<li>${esc(x)}</li>`)
          .join('')}</ul>`
      );
  } else {
    parti.push('<p style="font-size:11px">Indicatore non calcolabile con i dati inseriti.</p>');
  }

  // 2. Valori
  parti.push('<h2>2. Valori misurati per le soglie (art. 25-novies CCII)</h2>');
  parti.push(`<table><tbody>
<tr><td>Lavoratori subordinati o parasubordinati</td><td>${sino(v.conLavoratori, 'sì', 'no')}</td></tr>
<tr><td>Contributi dovuti nell’anno ${v.annoPrecedente}</td><td class="num">${euro(v.contributiDovutiAnnoPrecedente)}</td></tr>
<tr><td>Contributi non versati, partite rimaste all’ente scadute da oltre 90 giorni</td><td class="num">${euro(v.nonVersatoOltre90)}</td></tr>
<tr><td>Ritardo di oltre 90 giorni</td><td>${sino(
    v.ritardoOltre90Giorni,
    `sì${v.periodiInRitardo ? ` — ${v.periodiInRitardo} periodi` : ''}`,
    'no'
  )}</td></tr>
<tr><td>Denunce non presentate</td><td>${
    v.denunceNonPresentate === null
      ? '<i>Elenco denunce non letto</i>'
      : v.denunceNonPresentate === ''
        ? 'nessuna'
        : esc(v.denunceNonPresentate)
  }</td></tr>
<tr><td>Crediti affidati all’Agente della Riscossione (al netto dei sospesi)</td><td class="num">${euro(v.creditiAffidatiAgente)}</td></tr>
</tbody></table>`);

  // 3. Documenti
  parti.push('<h2>3. Documenti caricati e letti</h2>');
  parti.push(
    d.documenti.length
      ? `<table><thead><tr><th>File</th><th>Riconosciuto come</th><th>Uso</th></tr></thead><tbody>${d.documenti
          .map(
            (x) => `<tr><td>${esc(x.nome)}</td><td>${esc(x.tipo)}</td><td>${esc(x.esito)}</td></tr>`
          )
          .join('')}</tbody></table>`
      : '<p style="font-size:11px">Nessun documento caricato: valori inseriti a mano.</p>'
  );

  // 4. Lettura
  if (d.note.length) {
    parti.push('<h2>4. Cosa è stato letto nei documenti</h2>');
    parti.push(`<ul>${d.note.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`);
  }

  // 5. Perimetro
  parti.push(`<h2>${d.note.length ? '5' : '4'}. Perimetro</h2>`);
  parti.push(`<p class="perimetro">${esc(d.perimetro)}</p>`);
  parti.push('</div>');
  return parti.join('\n');
}
