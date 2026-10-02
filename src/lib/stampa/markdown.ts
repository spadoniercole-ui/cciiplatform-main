// src/lib/stampa/markdown.ts
//
// Da Markdown (il formato in cui l'AI scrive relazioni e analisi) a HTML
// per la STAMPA. Prima il testo si stampava così com'era: tabelle fatte di
// barre verticali, «##» e «**» in chiaro. Copre solo ciò che le relazioni
// usano davvero: titoli, grassetto/corsivo, elenchi, tabelle, separatori,
// paragrafi. Il testo viene sempre escapato: nessun HTML passa dal modello.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(testo: string): string {
  return esc(testo)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const cella = (riga: string) =>
  riga
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

const eSeparatore = (riga: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(riga);

export function markdownInHtml(md: string): string {
  const righe = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let paragrafo: string[] = [];
  let lista: { tipo: 'ul' | 'ol'; voci: string[] } | null = null;

  const chiudiParagrafo = () => {
    if (paragrafo.length) out.push(`<p>${paragrafo.map(inline).join('<br>')}</p>`);
    paragrafo = [];
  };
  const chiudiLista = () => {
    if (lista)
      out.push(
        `<${lista.tipo}>${lista.voci.map((v) => `<li>${inline(v)}</li>`).join('')}</${lista.tipo}>`
      );
    lista = null;
  };
  const chiudiTutto = () => {
    chiudiParagrafo();
    chiudiLista();
  };

  for (let i = 0; i < righe.length; i++) {
    const riga = righe[i];
    const t = riga.trim();
    if (t === '') {
      chiudiTutto();
      continue;
    }
    // Tabella: riga con barre seguita da una riga separatrice.
    if (t.startsWith('|') && i + 1 < righe.length && eSeparatore(righe[i + 1].trim())) {
      chiudiTutto();
      const testa = cella(t);
      i += 1;
      const corpo: string[][] = [];
      while (i + 1 < righe.length && righe[i + 1].trim().startsWith('|')) {
        i += 1;
        corpo.push(cella(righe[i]));
      }
      const num = (c: string) => /^[-+€\s]*[\d.,]+\s*(%|€)?$/.test(c) || /^€\s*[\d.,]+/.test(c);
      // Colonna numerica: tutte le celle piene sono numeri → anche il titolo a destra.
      const colonnaNumerica = testa.map((_, k) => {
        const piene = corpo.map((r) => r[k] ?? '').filter((c) => c !== '');
        return piene.length > 0 && piene.every(num);
      });
      out.push(
        `<table><thead><tr>${testa
          .map((c, k) => `<th${colonnaNumerica[k] ? ' class="num"' : ''}>${inline(c)}</th>`)
          .join('')}</tr></thead><tbody>${corpo
          .map(
            (r) =>
              `<tr>${testa
                .map((_, k) => {
                  const c = r[k] ?? '';
                  return `<td${num(c) ? ' class="num"' : ''}>${inline(c)}</td>`;
                })
                .join('')}</tr>`
          )
          .join('')}</tbody></table>`
      );
      continue;
    }
    const titolo = t.match(/^(#{1,4})\s+(.*)$/);
    if (titolo) {
      chiudiTutto();
      const livello = Math.min(titolo[1].length + 1, 5);
      out.push(`<h${livello}>${inline(titolo[2])}</h${livello}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      chiudiTutto();
      out.push('<hr>');
      continue;
    }
    const puntato = t.match(/^[-*•]\s+(.*)$/);
    const numerato = t.match(/^\d+[.)]\s+(.*)$/);
    if (puntato || numerato) {
      chiudiParagrafo();
      const tipo = puntato ? 'ul' : 'ol';
      if (!lista || lista.tipo !== tipo) {
        chiudiLista();
        lista = { tipo, voci: [] };
      }
      lista.voci.push((puntato ?? numerato)![1]);
      continue;
    }
    chiudiLista();
    paragrafo.push(t);
  }
  chiudiTutto();
  return out.join('\n');
}

/** Stile tipografico per il testo convertito, da affiancare allo stile di pagina. */
export const STILE_MARKDOWN = `
  .md h2 { font-size: 16px; margin: 18px 0 6px; }
  .md h3 { font-size: 14px; margin: 14px 0 4px; }
  .md h4, .md h5 { font-size: 13px; margin: 10px 0 4px; }
  .md p { margin: 6px 0; }
  .md ul, .md ol { margin: 4px 0 8px 20px; padding: 0; }
  .md li { margin: 2px 0; }
  .md hr { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }
  .md table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 8px 0 12px; }
  .md th { text-align: left; background: #f1f5f9; color: #334155; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; padding: 5px 7px; border-bottom: 1px solid #cbd5e1; }
  .md td { padding: 5px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .md th.num { text-align: right; }
  .md td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .md code { font-family: monospace; font-size: 11px; }`;
