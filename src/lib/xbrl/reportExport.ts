// src/lib/xbrl/reportExport.ts
//
// Generazione reale dei report PDF ed Excel della tab "Reportistica".
// Prima i due pulsanti chiamavano solo alert('Esportazione PDF...') / '...Excel...'.
// Esecuzione lato client (browser): i dati sono già nello stato React della
// pagina, non serve un giro di andata e ritorno al server per generare un
// file che poi verrebbe comunque scaricato dal browser.

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CompanyInfo {
  ragioneSociale: string;
  codiceFiscale: string;
  indirizzoSedeLegale: string;
  codiceAteco: string;
}

interface IndiceCalculated {
  codice: string;
  nome: string;
  valore: number | string | null;
  soglia: string;
  esito: 'OK' | 'VIOLATO' | 'NON_CALCOLABILE';
  note?: string;
}

interface SituazioneDebitoria {
  debitiBanche: number;
  debitiFornitori: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  altriDebiti: number;
  totaleDebiti: number;
  disponibilitaLiquide: number;
  pfn: number;
}

export interface DatiPerReport {
  company: CompanyInfo;
  indiciCndec: IndiceCalculated[];
  altriIndici: IndiceCalculated[];
  situazioneDebitoria: SituazioneDebitoria;
  relazioneAi: string;
}

function formattaEuro(val: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
}

function nomeFileSicuro(ragioneSociale: string): string {
  return (ragioneSociale || 'azienda')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

// ============================================================================
// EXPORT EXCEL
// ============================================================================

export function esportaExcel(dati: DatiPerReport): void {
  const wb = XLSX.utils.book_new();

  const foglioAnagrafica = XLSX.utils.aoa_to_sheet([
    ['Analisi CCII — Anagrafica'],
    [],
    ['Ragione Sociale', dati.company.ragioneSociale || 'N/D'],
    ['Codice Fiscale', dati.company.codiceFiscale || 'N/D'],
    ['Sede Legale', dati.company.indirizzoSedeLegale || 'N/D'],
    ['Codice ATECO', dati.company.codiceAteco || 'N/D'],
    ['Data generazione report', new Date().toLocaleString('it-IT')],
  ]);
  XLSX.utils.book_append_sheet(wb, foglioAnagrafica, 'Anagrafica');

  const righeIndiciCndec = [
    ['Codice', 'Indice', 'Soglia', 'Valore', 'Esito'],
    ...dati.indiciCndec.map((i) => [i.codice, i.nome, i.soglia, i.valore ?? 'N/D', i.esito]),
  ];
  const foglioCndec = XLSX.utils.aoa_to_sheet(righeIndiciCndec);
  XLSX.utils.book_append_sheet(wb, foglioCndec, 'Indici CNDEC');

  const righeAltriIndici = [
    ['Codice', 'Indice', 'Soglia', 'Valore', 'Esito'],
    ...dati.altriIndici.map((i) => [i.codice, i.nome, i.soglia, i.valore ?? 'N/D', i.esito]),
  ];
  const foglioAltri = XLSX.utils.aoa_to_sheet(righeAltriIndici);
  XLSX.utils.book_append_sheet(wb, foglioAltri, 'Altri Indici');

  const sd = dati.situazioneDebitoria;
  const foglioDebitoria = XLSX.utils.aoa_to_sheet([
    ['Situazione Debitoria e Finanziaria'],
    [],
    ['Voce', 'Importo (€)'],
    ['Debiti verso Banche', sd.debitiBanche],
    ['Debiti verso Fornitori', sd.debitiFornitori],
    ['Debiti Tributari', sd.debitiTributari],
    ['Debiti Previdenziali', sd.debitiPrevidenziali],
    ['Altri Debiti', sd.altriDebiti],
    ['Totale Debiti', sd.totaleDebiti],
    ['Disponibilità Liquide', sd.disponibilitaLiquide],
    ['Posizione Finanziaria Netta (PFN)', sd.pfn],
  ]);
  XLSX.utils.book_append_sheet(wb, foglioDebitoria, 'Situazione Debitoria');

  if (dati.relazioneAi && dati.relazioneAi.trim().length > 0) {
    const foglioRelazione = XLSX.utils.aoa_to_sheet([
      ['Relazione AI'],
      [],
      ...dati.relazioneAi.split('\n').map((riga) => [riga]),
    ]);
    XLSX.utils.book_append_sheet(wb, foglioRelazione, 'Relazione AI');
  }

  XLSX.writeFile(wb, `analisi_ccii_${nomeFileSicuro(dati.company.ragioneSociale)}.xlsx`);
}

// ============================================================================
// EXPORT PDF
// ============================================================================

const COLORE_OK = [16, 129, 87] as const; // emerald-700
const COLORE_VIOLATO = [190, 24, 62] as const; // rose-700
const COLORE_ND = [100, 116, 139] as const; // slate-500

function coloreEsito(esito: IndiceCalculated['esito']): readonly [number, number, number] {
  if (esito === 'OK') return COLORE_OK;
  if (esito === 'VIOLATO') return COLORE_VIOLATO;
  return COLORE_ND;
}

function aggiungiTabellaIndici(
  doc: jsPDF,
  titolo: string,
  indici: IndiceCalculated[],
  startY: number
): number {
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(titolo, 14, startY);

  autoTable(doc, {
    startY: startY + 3,
    head: [['Codice', 'Indice', 'Soglia', 'Valore', 'Esito']],
    body: indici.map((i) => [i.codice, i.nome, i.soglia, String(i.valore ?? 'N/D'), i.esito]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const esito = indici[data.row.index]?.esito;
        if (esito) {
          data.cell.styles.textColor = [...coloreEsito(esito)];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  // @ts-expect-error jspdf-autotable estende jsPDF con questa proprietà a runtime
  return doc.lastAutoTable.finalY + 10;
}

export function esportaPdf(dati: DatiPerReport): void {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Relazione di Analisi CCII', 14, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ragione Sociale: ${dati.company.ragioneSociale || 'N/D'}`, 14, 27);
  doc.text(`Codice Fiscale: ${dati.company.codiceFiscale || 'N/D'}`, 14, 33);
  doc.text(`Sede Legale: ${dati.company.indirizzoSedeLegale || 'N/D'}`, 14, 39);
  doc.text(`Generato il: ${new Date().toLocaleString('it-IT')}`, 14, 45);

  let y = 56;
  y = aggiungiTabellaIndici(doc, '1. Indici di Allerta CCII (CNDCEC)', dati.indiciCndec, y);

  if (dati.altriIndici.length > 0) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    y = aggiungiTabellaIndici(doc, '2. Altri Indici', dati.altriIndici, y);
  }

  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  const sd = dati.situazioneDebitoria;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('3. Situazione Debitoria e Finanziaria', 14, y);
  autoTable(doc, {
    startY: y + 3,
    body: [
      ['Debiti verso Banche', formattaEuro(sd.debitiBanche)],
      ['Debiti verso Fornitori', formattaEuro(sd.debitiFornitori)],
      ['Debiti Tributari', formattaEuro(sd.debitiTributari)],
      ['Debiti Previdenziali', formattaEuro(sd.debitiPrevidenziali)],
      ['Altri Debiti', formattaEuro(sd.altriDebiti)],
      ['Totale Debiti', formattaEuro(sd.totaleDebiti)],
      ['Disponibilità Liquide', formattaEuro(sd.disponibilitaLiquide)],
      ['Posizione Finanziaria Netta (PFN)', formattaEuro(sd.pfn)],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    theme: 'plain',
  });

  // @ts-expect-error jspdf-autotable estende jsPDF con questa proprietà a runtime
  y = doc.lastAutoTable.finalY + 10;

  if (dati.relazioneAi && dati.relazioneAi.trim().length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Relazione Tecnico-Diagnostica', 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const righe = doc.splitTextToSize(dati.relazioneAi, 180);
    righe.forEach((riga: string) => {
      if (y > 285) {
        doc.addPage();
        y = 20;
      }
      doc.text(riga, 14, y);
      y += 4.5;
    });
  }

  doc.save(`analisi_ccii_${nomeFileSicuro(dati.company.ragioneSociale)}.pdf`);
}
