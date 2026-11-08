// src/lib/ponte/report.ts
//
// Report del Piano-ponte: HTML stampabile, senza dipendenze e senza AI.
// Il documento deve far vedere da dove vengono i numeri e dove non tornano,
// non nascondere le differenze dietro una sintesi.

import type { DatiPonte, EsitoPonte, PonteSalvato } from './types';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
const data = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');
const stato = (s: string) =>
  ({
    BOZZA: 'Bozza',
    CALCOLATO: 'Calcolato',
    CONFERMATO: 'Confermato',
    SUPERATO: 'Superato',
    ARCHIVIATO: 'Archiviato',
  })[s] ?? s;

const th = (testo: string) =>
  `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#475569">${esc(testo)}</th>`;
const td = (testo: unknown, allinea: 'left' | 'right' = 'left') =>
  `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:${allinea};font-size:11px;vertical-align:top">${esc(testo)}</td>`;
const riga = (etichetta: string, valore: unknown, grassetto = false) =>
  `<tr>${td(etichetta)}${td(valore, 'right')}</tr>`.replace(
    '<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:11px;vertical-align:top">',
    `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:11px;vertical-align:top;${grassetto ? 'font-weight:700' : ''}">`
  );

export function reportPonteHtml(input: { dati: DatiPonte; ponte: PonteSalvato }): string {
  const { dati, ponte } = input;
  const output = ponte.output as EsitoPonte | null;
  if (!output) {
    return `<p>Il Piano-ponte non ha ancora un output calcolato.</p>`;
  }
  const ultimo = dati.esercizi[dati.esercizi.length - 1];
  const s = ultimo?.dati;
  const si = output.sintesiIntegrata ?? null;
  const fonti = [
    `Bilanci XBRL: ${dati.esercizi.map((e) => e.anno).join(', ') || 'nessuno'}`,
    `Note integrative: ${dati.note.length} testi letti`,
    `Visura: ${dati.visura ? 'disponibile' : 'non disponibile'}`,
    `Settore: ${dati.settore.descrizione}`,
    `Debito ente: ${
      dati.debitoEnte
        ? `${euro(dati.debitoEnte.totale)} su ${dati.debitoEnte.righe} posizioni`
        : 'non disponibile'
    }`,
  ];

  return `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1e293b;font-size:11px;line-height:1.45">
  <h1 style="font-size:20px;margin:0 0 4px">Piano-ponte</h1>
  <p style="font-size:12px;color:#475569;margin:0 0 16px">${esc(dati.azienda.ragioneSociale)} — Data verifica ${esc(data(ponte.dataRiferimento))}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
    <tr>${td('Versione')}${td(`v${ponte.versione} — ${stato(ponte.stato)}`, 'right')}</tr>
    <tr>${td('Ultimo bilancio')}${td(ultimo ? String(ultimo.anno) : '—', 'right')}</tr>
    <tr>${td('Generato il')}${td(ponte.createdAt ? new Date(ponte.createdAt).toLocaleString('it-IT') : '—', 'right')}</tr>
    <tr>${td('Copertura')}${td(`${Math.round(output.copertura.punteggio * 100)}% — ${output.copertura.livello}`, 'right')}</tr>
  </table>

  <h2 style="font-size:13px;margin:18px 0 6px">1. Dati di partenza</h2>
  <ul style="margin:0 0 14px 18px;padding:0">${fonti.map((f) => `<li style="margin:2px 0">${esc(f)}</li>`).join('')}</ul>

  <h2 style="font-size:13px;margin:18px 0 6px">2. Situazione storica</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
    ${riga('Ricavi delle vendite', euro(s?.ricaviVendite ?? 0))}
    ${riga('Valore della produzione', euro(s?.valoreProduzione ?? 0))}
    ${riga('EBITDA', euro(s?.ebitda ?? 0))}
    ${riga('Utile d’esercizio', euro(s?.utileEsercizio ?? 0))}
    ${riga('Patrimonio netto', euro(s?.patrimonioNetto ?? 0))}
    ${riga('Totale debiti', euro(s?.totaleDebiti ?? 0))}
    ${riga('Disponibilità liquide', euro(s?.disponibilitaLiquide ?? 0))}
    ${riga('PFN (banche − cassa)', euro((s?.debitiBanche ?? 0) - (s?.disponibilitaLiquide ?? 0)), true)}
  </table>

  <h2 style="font-size:13px;margin:18px 0 6px">3. Assunzioni</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
    <thead><tr>${th('Assunzione')}${th('Valore')}${th('Fonte')}${th('Perché')}</tr></thead>
    <tbody>${output.assunzioni
      .map(
        (a) =>
          `<tr>${td(a.etichetta)}${td(
            a.unita === '%'
              ? `${a.valore.toLocaleString('it-IT')}%`
              : a.unita === 'giorni'
                ? `${a.valore.toLocaleString('it-IT')} gg`
                : euro(a.valore),
            'right'
          )}${td(a.fonte)}${td(a.motivazione)}</tr>`
      )
      .join('')}</tbody>
  </table>

  <h2 style="font-size:13px;margin:18px 0 6px">4. Proiezione</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
    <thead><tr>${th('Voce')}${output.anni.map((a) => th(String(a.anno))).join('')}</tr></thead>
    <tbody>
      <tr>${td('Ricavi')}${output.anni.map((a) => td(euro(a.ricaviVendite), 'right')).join('')}</tr>
      <tr>${td('EBITDA')}${output.anni.map((a) => td(euro(a.ebitda), 'right')).join('')}</tr>
      <tr>${td('EBIT')}${output.anni.map((a) => td(euro(a.ebit), 'right')).join('')}</tr>
      <tr>${td('Utile')}${output.anni.map((a) => td(euro(a.utile), 'right')).join('')}</tr>
      <tr>${td('Flusso di cassa')}${output.anni.map((a) => td(euro(a.flussoCassa), 'right')).join('')}</tr>
      <tr>${td('Cassa finale')}${output.anni.map((a) => td(euro(a.disponibilitaLiquide), 'right')).join('')}</tr>
      <tr>${td('Debito totale')}${output.anni.map((a) => td(euro(a.totaleDebiti), 'right')).join('')}</tr>
      <tr>${td('Patrimonio netto')}${output.anni.map((a) => td(euro(a.patrimonioNetto), 'right')).join('')}</tr>
    </tbody>
  </table>

  <h2 style="font-size:13px;margin:18px 0 6px">5. Scenari</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
    <thead><tr>${th('Scenario')}${th('Cassa finale')}${th('Debito finale')}${th('Utile cumulato')}${th('Fabbisogno')}</tr></thead>
    <tbody>
      <tr>${td('Base (centrale)')}${td(euro(output.cassaFinale), 'right')}${td(euro(output.debitoFinale), 'right')}${td(euro(output.utileTotale), 'right')}${td(euro(output.fabbisognoSenzaFinanziamento), 'right')}</tr>
      <tr>${td('Ottimistico: ricavi +10%, margine +2 pp, incasso −15 gg, pagamento +15 gg')}${td(euro(output.scenari.favorevole.cassaFinale), 'right')}${td(euro(output.scenari.favorevole.debitoFinale), 'right')}${td(euro(output.scenari.favorevole.utileTotale), 'right')}${td(euro(output.scenari.favorevole.fabbisognoSenzaFinanziamento), 'right')}</tr>
      <tr>${td('Pessimistico: simmetrico')}${td(euro(output.scenari.sfavorevole.cassaFinale), 'right')}${td(euro(output.scenari.sfavorevole.debitoFinale), 'right')}${td(euro(output.scenari.sfavorevole.utileTotale), 'right')}${td(euro(output.scenari.sfavorevole.fabbisognoSenzaFinanziamento), 'right')}</tr>
    </tbody>
  </table>

  <h2 style="font-size:13px;margin:18px 0 6px">6. Riconciliazione</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
    <thead><tr>${th('Voce')}${th('Importo')}</tr></thead>
    <tbody>${output.riconciliazione.voci
      .map((v) => `<tr>${td(v.etichetta)}${td(euro(v.importo), 'right')}</tr>`)
      .join('')}</tbody>
  </table>
  <p style="margin:0 0 14px;font-size:10px;color:#64748b">La rettifica per perimetro debito ente è una voce esplicita: non è un debito nuovo e non è una rinuncia al credito. Il fabbisogno senza finanziamento è la cassa negativa minima: non viene trasformato in debito.</p>

  ${
    si
      ? `<h2 style="font-size:13px;margin:18px 0 6px">7. Sintesi integrata</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
    <thead><tr>${th('Voce')}${th('Importo')}</tr></thead>
    <tbody>
      ${riga('Credito certo dell’ente', si.creditoEnte === null ? 'non disponibile' : euro(si.creditoEnte))}
      ${riga('Debito totale stimato alla Data verifica', euro(si.debitoTotaleStimato))}
      ${riga('Cassa stimata alla Data verifica', euro(si.cassaFinale))}
      ${riga(
        'Incidenza del credito sul debito',
        si.incidenzaCreditoPct === null
          ? 'non calcolabile'
          : `${si.incidenzaCreditoPct.toLocaleString('it-IT')}%`
      )}
    </tbody>
  </table>
  ${
    si.recupero
      ? `<table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <thead><tr>${th('Ipotesi di recupero')}${th('Percentuale')}${th('Importo per l’ente')}</tr></thead>
    <tbody>
      <tr>${td(`Liquidazione giudiziale${si.rangoEtichetta ? ` — rango ${si.rangoEtichetta}` : ''}`)}${td(
        si.recupero.liquidazione.percentuale === null
          ? 'non impostata'
          : `${si.recupero.liquidazione.percentuale.toLocaleString('it-IT')}%`,
        'right'
      )}${td(
        si.recupero.liquidazione.netto === null
          ? 'non calcolabile'
          : euro(si.recupero.liquidazione.netto),
        'right'
      )}</tr>
      <tr>${td('Cram down omologato')}${td(
        si.recupero.cramDown.percentuale === null
          ? 'non impostata'
          : `${si.recupero.cramDown.percentuale.toLocaleString('it-IT')}%`,
        'right'
      )}${td(
        si.recupero.cramDown.netto === null ? 'non calcolabile' : euro(si.recupero.cramDown.netto),
        'right'
      )}</tr>
    </tbody>
  </table>
  <p style="margin:0 0 10px;font-size:10px;color:#64748b">${esc(si.recupero.liquidazione.dettaglio)} ${esc(si.recupero.cramDown.dettaglio)}</p>`
      : `<p style="margin:0 0 10px;font-size:11px;color:#92400e">Recupero non calcolabile: ${esc(
          si.mancanti.join('; ') || 'dati insufficienti'
        )}.</p>`
  }
  ${
    si.avvisi.length
      ? `<ul style="margin:0 0 10px 18px;padding:0">${si.avvisi.map((a) => `<li style="margin:2px 0;font-size:10px;color:#92400e">${esc(a)}</li>`).join('')}</ul>`
      : ''
  }
  <p style="margin:0 0 14px;font-size:10px;color:#64748b">Il credito dell’ente, il debito totale stimato e il recupero sono tre termini di paragone: il recupero non si sottrae al debito e le percentuali sono quelle configurate dall’ente, non una stima della piattaforma.</p>`
      : ''
  }

  <h2 style="font-size:13px;margin:18px 0 6px">8. Copertura e avvertenze</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
    <thead><tr>${th('Dimensione')}${th('Peso')}${th('Stato')}${th('Dettaglio')}</tr></thead>
    <tbody>${output.copertura.componenti
      .map(
        (c) =>
          `<tr>${td(c.etichetta)}${td(`${Math.round(c.peso * 100)}%`, 'right')}${td(c.determinato ? 'determinata' : 'assente')}${td(c.dettaglio)}</tr>`
      )
      .join('')}</tbody>
  </table>
  ${
    output.avvisi.length
      ? `<ul style="margin:0 0 10px 18px;padding:0">${output.avvisi.map((a) => `<li style="margin:3px 0"><b>${esc(a.codice)}</b> — ${esc(a.testo)}</li>`).join('')}</ul>`
      : ''
  }
  <ul style="margin:0 0 14px 18px;padding:0">${output.limiti.map((l) => `<li style="margin:3px 0">${esc(l)}</li>`).join('')}</ul>

  <p style="margin:18px 0 0;padding-top:8px;border-top:1px solid #cbd5e1;font-size:10px;color:#64748b">${esc(output.sintesi)}</p>
  <p style="margin:6px 0 0;font-size:9px;color:#94a3b8">Report generato dalla piattaforma sul Ponte ${esc(output.versioneMotore)}. Le assunzioni sono dichiarate; i numeri sono deterministici. Il documento non sostituisce la valutazione del professionista.</p>
</div>`;
}
