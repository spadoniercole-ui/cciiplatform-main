// src/lib/soglie25novies/excelVistaSpazio.ts
//
// L'EXCEL DELLA VISTA D'INSIEME: una riga per azienda, una colonna per
// esercizio, con la quota scaduti / dovuti di ogni anno.
//
// Il foglio è la fotografia di ciò che la pagina mostra, nello stesso ordine
// (prima chi cresce di più): chi lo apre per lavorarci trova le aziende dove
// sono, senza dover riordinare a mano. Accanto alle quote ci sono le due cose
// che le quote da sole non dicono — la variazione in punti e il debito scaduto
// da oltre 90 giorni — più la provenienza della serie.
//
// Le celle vuote NON sono zeri: un anno con il dovuto e senza lo scaduto non
// ha un rapporto, e il ritardo che nessuno ha misurato non vale 0 €. Una
// cella vuota in Excel si vede; uno zero scritto al suo posto direbbe che il
// requisito temporale è assente, che è una conclusione e non un dato mancante.
// La riga di nota in testa al foglio lo dichiara, perché il file viaggia
// senza la pagina che lo spiega.

import * as XLSX from 'xlsx';
import { etichettaFonte, type RigaVistaContributi } from '@/lib/soglie25novies/vistaSpazio';

function nomeFileSicuro(testo: string): string {
  return (testo || 'spazio')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/** Gli anni di tutte le serie: le colonne del foglio, in ordine. */
export function anniDellaVista(righe: readonly RigaVistaContributi[]): number[] {
  return [...new Set(righe.flatMap((r) => r.anni.map((a) => a.anno)))].sort((a, b) => a - b);
}

export function esportaVistaContributiExcel(
  nomeSpazio: string,
  righe: readonly RigaVistaContributi[]
): void {
  const anni = anniDellaVista(righe);

  const dati: (string | number)[][] = [
    [
      'Una riga per azienda, una colonna per esercizio: la percentuale è il rapporto scaduti / dovuti ' +
        'dell’art. 25-novies, lett. a). La cella vuota non è zero: quell’anno ha il dovuto senza lo scaduto ' +
        '(o viceversa), quindi il rapporto non si calcola. Anche «Oltre 90 giorni» resta vuoto quando il ' +
        'ritardo non è stato misurato — le serie ricostruite dal triage non lo portano. La crescita non è ' +
        'una soglia superata: la fattispecie richiede anche il ritardo oltre 90 giorni e, con lavoratori, ' +
        'i 15.000 €.',
    ],
    [
      'Azienda',
      ...anni.map((a) => String(a)),
      'Variazione (punti)',
      'Oltre 90 giorni (€)',
      'Esercizi con ritardo',
      'Fonte',
      'Ricostruita il',
    ],
  ];

  for (const r of righe) {
    const quote = anni.map((anno) => {
      const a = r.anni.find((x) => x.anno === anno);
      return a?.quota ?? '';
    });
    dati.push([
      r.ragioneSociale,
      ...quote,
      r.variazionePunti === null ? '' : Number(r.variazionePunti.toFixed(1)),
      r.oltre90 === null ? '' : Math.round(r.oltre90),
      r.anniConRitardo.length > 0 ? r.anniConRitardo.join(', ') : '',
      etichettaFonte(r),
      r.ricostruitaIl ?? '',
    ]);
  }

  const foglio = XLSX.utils.aoa_to_sheet(dati);

  // Le percentuali restano numeri (non testo): si possono ordinare e
  // sommare, e la cella vuota resta vuota.
  for (let riga = 2; riga < dati.length; riga++) {
    anni.forEach((_, i) => {
      const cella = foglio[XLSX.utils.encode_cell({ r: riga, c: i + 1 })];
      if (cella && typeof cella.v === 'number') cella.z = '0.0%';
    });
    const variazione = foglio[XLSX.utils.encode_cell({ r: riga, c: anni.length + 1 })];
    if (variazione && typeof variazione.v === 'number') variazione.z = '0.0';
    const oltre90 = foglio[XLSX.utils.encode_cell({ r: riga, c: anni.length + 2 })];
    if (oltre90 && typeof oltre90.v === 'number') oltre90.z = '#,##0';
  }

  const larghezze = [
    { wch: 34 },
    ...anni.map(() => ({ wch: 9 })),
    { wch: 15 },
    { wch: 17 },
    { wch: 20 },
    { wch: 24 },
    { wch: 13 },
  ];
  foglio['!cols'] = larghezze;
  foglio['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: larghezze.length - 1 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglio, 'Contributi per anno');
  XLSX.writeFile(wb, `contributi_per_anno_${nomeFileSicuro(nomeSpazio)}.xlsx`);
}
