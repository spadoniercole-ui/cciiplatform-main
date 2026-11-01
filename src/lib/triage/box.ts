// src/lib/triage/box.ts
//
// LA CORNICE NUMERATA DEI REPORT.
//
// Un report che elenca sezioni senza numero costringe chi lo legge a
// ricostruire l'ordine, e a citarlo a memoria («il pezzo dove si parla delle
// soglie»). Da qui in poi ogni box informativo porta il proprio numero in alto
// a sinistra, i numeri che lo fondano, la spiegazione tecnica e i riferimenti
// — normativi o interni all'ente — che hanno innescato quella verifica. Un box
// non si spezza: nel foglio stampato comincia su una pagina nuova.
//
// PERCHÉ UN MODULO A PARTE. La cornice è una convenzione di lettura, non un
// dettaglio grafico: la usano il rendiconto del triage oggi e gli altri report
// in cascata domani. Scritta una volta, i box nascono già numerati e con la
// stessa struttura; riscritta in ogni componente, ognuno la farebbe a modo suo.
//
// Logica pura: produce HTML da inserire, non conosce né React né il database.

/** Una fonte che ha innescato il box: una norma, una circolare, un parametro. */
export interface RiferimentoBox {
  fonte: string;
  dettaglio?: string | null;
  /** Presente solo per le fonti ufficiali già verificate. */
  url?: string | null;
  /** true quando il riferimento non è stato riscontrato sul testo. */
  daVerificare?: boolean;
}

/** Un numero del box, con la sua etichetta. */
export interface NumeroBox {
  etichetta: string;
  valore: string;
  /** Perché quel valore è quello che è, se non è ovvio. */
  nota?: string | null;
}

export interface BoxTriage {
  numero: number;
  titolo: string;
  /** Una frase che dice che cosa il box conclude, se c'è una conclusione. */
  sintesi?: string | null;
  numeri?: NumeroBox[];
  /** La spiegazione tecnica, in prosa: che cosa è stato verificato e come. */
  spiegazione: string;
  riferimenti?: RiferimentoBox[];
  /** Ciò che il box NON dice: il limite della verifica. */
  avvertenze?: string[];
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * La cornice di un box, in HTML.
 *
 * `page-break-after: always` è ciò che rende «una pagina per box»: senza,
 * il box successivo comincia a metà foglio e la numerazione perde il suo
 * senso. L'ultimo box non forza il salto (lo chiude il foglio).
 */
export function htmlBox(box: BoxTriage, ultimo = false): string {
  const pezzi: string[] = [];
  pezzi.push(`<section class="triage-box"${ultimo ? '' : ' style="page-break-after:always"'}>`);
  pezzi.push(
    `<div class="triage-box-num" aria-hidden="true">${box.numero}</div>` +
      `<h2><span class="triage-box-num-inline">${box.numero}</span> ${esc(box.titolo)}</h2>`
  );
  if (box.sintesi) pezzi.push(`<p class="triage-box-sintesi">${esc(box.sintesi)}</p>`);

  if (box.numeri?.length) {
    pezzi.push(
      `<table class="triage-box-numeri"><tbody>${box.numeri
        .map(
          (n) =>
            `<tr><th>${esc(n.etichetta)}</th><td class="num">${esc(n.valore)}</td>${
              n.nota ? `<td class="nota">${esc(n.nota)}</td>` : ''
            }</tr>`
        )
        .join('')}</tbody></table>`
    );
  }

  pezzi.push(`<p class="triage-box-testo">${esc(box.spiegazione)}</p>`);

  if (box.riferimenti?.length) {
    pezzi.push(
      `<div class="triage-box-rif"><b>Riferimenti</b><ul>${box.riferimenti
        .map((r) => {
          const testo = `${esc(r.fonte)}${r.dettaglio ? ` — ${esc(r.dettaglio)}` : ''}`;
          const link =
            r.url && /^https?:\/\//.test(r.url)
              ? ` <a href="${esc(r.url)}" target="_blank" rel="noreferrer">fonte</a>`
              : '';
          const avviso = r.daVerificare ? ' <i>(riferimento da verificare sul testo)</i>' : '';
          return `<li>${testo}${link}${avviso}</li>`;
        })
        .join('')}</ul></div>`
    );
  }

  if (box.avvertenze?.length) {
    pezzi.push(
      `<div class="triage-box-avvisi"><ul>${box.avvertenze
        .map((a) => `<li>${esc(a)}</li>`)
        .join('')}</ul></div>`
    );
  }

  pezzi.push('</section>');
  return pezzi.join('\n');
}

/** Tutti i box, con i salti di pagina fra l'uno e l'altro tranne l'ultimo. */
export function htmlBoxes(boxes: BoxTriage[]): string {
  return boxes.map((b, i) => htmlBox(b, i === boxes.length - 1)).join('\n');
}

/** Lo stile della cornice: sta in un punto solo, così i report non divergono. */
export const STILE_BOX = `
.triage-box{position:relative;padding:14px 16px 12px;border:1px solid #cbd5e1;border-radius:8px;margin:14px 0;page-break-inside:avoid}
.triage-box-num{position:absolute;top:8px;left:8px;width:26px;height:26px;border-radius:6px;background:#0f172a;color:#fff;font-weight:700;font-size:13px;text-align:center;line-height:26px}
.triage-box h2{font-size:14px;margin:0 0 8px;padding-left:34px}
.triage-box-num-inline{display:none}
.triage-box-sintesi{font-size:12px;font-weight:700;margin:6px 0 8px;color:#0f172a}
.triage-box-numeri{width:100%;border-collapse:collapse;margin:6px 0 10px}
.triage-box-numeri th,.triage-box-numeri td{font-size:11px;border-bottom:1px solid #e2e8f0;padding:4px 6px;text-align:left;vertical-align:top}
.triage-box-numeri th{width:38%;font-weight:600;color:#334155}
.triage-box-numeri td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.triage-box-numeri td.nota{color:#64748b}
.triage-box-testo{font-size:11px;line-height:1.5;margin:6px 0}
.triage-box-rif{font-size:11px;color:#334155}
.triage-box-rif ul{margin:4px 0 0 18px;padding:0}
.triage-box-avvisi{font-size:10px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 8px;margin-top:8px}
.triage-box-avvisi ul{margin:0 0 0 16px;padding:0}
`;

/**
 * Verifica di coerenza della sequenza: i numeri devono essere 1..n, senza
 * buchi. Un report che salta il 4 fa pensare a un box perso, e chi lo cita
 * non sa se manca davvero.
 */
export function numerazioneCoerente(boxes: BoxTriage[]): boolean {
  return boxes.every((b, i) => b.numero === i + 1);
}
