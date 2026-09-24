// src/lib/stampaTesto.ts
//
// Un PDF stampabile via la stampa nativa del browser (sempre
// disponibile "Salva come PDF", nessuna libreria pesante da
// aggiungere al bundle) — grezzo apposta, non un documento impaginato.
// Usata da Screening, Analisi Proposta Ricevente, e Brogliaccio: stesso
// bisogno in tre punti diversi, una sola implementazione.

import { APP_VERSION } from '@/lib/appVersion';

/**
 * Parametri di stampa dell'ente (Parametri di Spazio › Stampa): margini,
 * intestazione, pie' di pagina, logo. Caricati una volta per spazio dal
 * componente ParametriStampaLoader e tenuti qui, cosi' ogni stampa li applica
 * senza che i chiamanti cambino.
 */
export interface ParametriStampa {
  margini: { alto: number; destro: number; basso: number; sinistro: number };
  intestazione: string | null;
  piePagina: string | null;
  logoDataUrl: string | null;
}
export const PARAMETRI_STAMPA_PREDEFINITI: ParametriStampa = {
  margini: { alto: 15, destro: 15, basso: 15, sinistro: 15 },
  intestazione: null,
  piePagina: null,
  logoDataUrl: null,
};
let parametriStampa: ParametriStampa = PARAMETRI_STAMPA_PREDEFINITI;
export function impostaParametriStampa(p: ParametriStampa | null): void {
  parametriStampa = p ?? PARAMETRI_STAMPA_PREDEFINITI;
}
const escH = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function stilePagina(): string {
  const m = parametriStampa.margini;
  const conTestata = !!(parametriStampa.logoDataUrl || parametriStampa.intestazione);
  const conPie = !!parametriStampa.piePagina;
  // In stampa la testata e il pie' dell'ente sono fissi: si ripetono su ogni
  // pagina, il pie' sta in fondo. Il corpo riserva lo spazio con il padding.
  // A schermo (anteprima nella finestra) restano nel flusso.
  return `
  @page { margin: ${m.alto}mm ${m.destro}mm ${m.basso}mm ${m.sinistro}mm; }
  .testata { display:flex; align-items:center; gap:18px; border-bottom:1px solid #cbd5e1; padding-bottom:10px; margin-bottom:18px; }
  .testata img { max-height:72px; max-width:220px; }
  .testata .ente { font-size:13px; color:#334155; white-space:pre-line; line-height:1.35; letter-spacing:.02em; }
  .pie-ente { font-size:10px; color:#64748b; white-space:pre-line; border-top:1px solid #cbd5e1; padding-top:6px; margin-top:24px; text-align:center; }
  @media print {
    body { max-width:none; margin:0; ${conTestata ? 'padding-top:96px;' : ''} ${conPie ? 'padding-bottom:48px;' : ''} }
    .testata { position:fixed; top:0; left:0; right:0; margin:0; background:#fff; }
    .pie-ente { position:fixed; bottom:0; left:0; right:0; margin:0; background:#fff; }
    h1 { page-break-after:avoid; }
    table, tr { page-break-inside:avoid; }
  }`;
}
function testataEnte(): string {
  const p = parametriStampa;
  if (!p.logoDataUrl && !p.intestazione) return '';
  return `<div class="testata">${p.logoDataUrl ? `<img src="${p.logoDataUrl}" alt="Logo dell’ente">` : ''}${p.intestazione ? `<div class="ente">${escH(p.intestazione)}</div>` : ''}</div>`;
}
function pieEnte(): string {
  return parametriStampa.piePagina
    ? `<div class="pie-ente">${escH(parametriStampa.piePagina)}</div>`
    : '';
}

/**
 * Impronta SHA-256 del contenuto esportato, calcolata nel browser. Con la
 * versione e la data e' il piede di ogni PDF: due documenti con impronta
 * diversa differiscono nel contenuto; con versione diversa puo' essere
 * cambiato il motore, non i dati. E' anche la prova che il documento non e'
 * stato modificato dopo l'esportazione.
 */
export async function improntaContenuto(contenuto: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contenuto));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

export function piedeDocumento(impronta: string | null, dataGenerazione: string | null): string {
  const esportato = new Date().toLocaleString('it-IT');
  const generato = dataGenerazione ? new Date(dataGenerazione).toLocaleString('it-IT') : null;
  return `<div class="piede">
  CCIIPlatform ${APP_VERSION} — esportato il ${esportato}${generato ? ` — contenuto generato il ${generato}` : ''}.<br>
  Impronta SHA-256 del contenuto: <span class="impronta">${impronta ?? 'non calcolabile in questo browser'}</span><br>
  A parità di contenuto l’impronta è identica: un’impronta diversa significa contenuto diverso; una versione diversa può significare un motore diverso a parità di dati.
</div>`;
}

const STILE_PIEDE = `
  .piede { margin-top: 32px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 9px; line-height: 1.5; }
  .impronta { font-family: monospace; word-break: break-all; }`;

/**
 * Come stampaTesto ma con un corpo HTML libero (es. una tabella): utile quando
 * il contenuto non è prosa ma un prospetto. Il chiamante fornisce l'HTML del
 * <body> (già sanificato/costruito da lui, non da input utente grezzo).
 */
export function stampaHtml(
  titolo: string,
  corpoHtml: string,
  sottotitolo?: string,
  dataGenerazione: string | null = null
) {
  // La finestra si apre SUBITO, nel gesto dell'utente (altrimenti il browser
  // la blocca); l'impronta si calcola dopo, poi si scrive il documento.
  const finestra = window.open('', '_blank');
  if (!finestra) return;
  void improntaContenuto(corpoHtml).then((impronta) => {
    finestra.document.write(`<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>${titolo}</title>
<style>
  body { font-family: Georgia, serif; max-width: 820px; margin: 40px auto; color: #1e293b; line-height: 1.55; font-size: 13px; }
  h1 { font-size: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 8px; margin: 0 0 6px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 22px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 14px 0; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { text-transform: uppercase; font-size: 10px; color: #64748b; letter-spacing: .04em; }
  tr.tot { font-weight: bold; background: #f8fafc; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .note { color: #94a3b8; font-size: 10px; margin-top: 16px; }${STILE_PIEDE}${stilePagina()}
</style>
</head>
<body>
  ${testataEnte()}
  <h1>${titolo}</h1>
  ${sottotitolo ? `<div class="sub">${sottotitolo}</div>` : ''}
  ${corpoHtml}
  ${pieEnte()}
  ${piedeDocumento(impronta, dataGenerazione)}
</body>
</html>`);
    finestra.document.close();
    finestra.focus();
    finestra.print();
  });
}

export function stampaTesto(titolo: string, testo: string, dataGenerazione: string | null) {
  const finestra = window.open('', '_blank');
  if (!finestra) return;
  const dataFormattata = dataGenerazione ? new Date(dataGenerazione).toLocaleString('it-IT') : '';
  void improntaContenuto(testo).then((impronta) => {
    finestra.document.write(`<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>${titolo}</title>
<style>
  body { font-family: Georgia, serif; max-width: 720px; margin: 40px auto; color: #1e293b; line-height: 1.6; font-size: 13px; }
  h1 { font-size: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 8px; margin: 0 0 6px; }
  .data { color: #64748b; font-size: 12px; margin-bottom: 24px; }
  .testo { white-space: pre-wrap; font-size: 13px; }${STILE_PIEDE}${stilePagina()}
</style>
</head>
<body>
  ${testataEnte()}
  <h1>${titolo}</h1>
  ${dataFormattata ? `<div class="data">Generato il ${dataFormattata}</div>` : ''}
  <div class="testo">${testo.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  ${pieEnte()}
  ${piedeDocumento(impronta, dataGenerazione)}
</body>
</html>`);
    finestra.document.close();
    finestra.focus();
    finestra.print();
  });
}
