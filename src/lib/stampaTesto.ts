// src/lib/stampaTesto.ts
//
// Un PDF stampabile via la stampa nativa del browser (sempre
// disponibile "Salva come PDF", nessuna libreria pesante da
// aggiungere al bundle) — grezzo apposta, non un documento impaginato.
// Usata da Screening, Analisi Proposta Ricevente, e Brogliaccio: stesso
// bisogno in tre punti diversi, una sola implementazione.

export function stampaTesto(titolo: string, testo: string, dataGenerazione: string | null) {
  const finestra = window.open('', '_blank');
  if (!finestra) return;
  const dataFormattata = dataGenerazione ? new Date(dataGenerazione).toLocaleString('it-IT') : '';
  finestra.document.write(`<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>${titolo}</title>
<style>
  body { font-family: Georgia, serif; max-width: 720px; margin: 40px auto; color: #1e293b; line-height: 1.6; }
  h1 { font-size: 18px; border-bottom: 2px solid #1e293b; padding-bottom: 8px; }
  .data { color: #64748b; font-size: 12px; margin-bottom: 24px; }
  .testo { white-space: pre-wrap; font-size: 13px; }
</style>
</head>
<body>
  <h1>${titolo}</h1>
  ${dataFormattata ? `<div class="data">Generato il ${dataFormattata}</div>` : ''}
  <div class="testo">${testo.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
</body>
</html>`);
  finestra.document.close();
  finestra.focus();
  finestra.print();
}
