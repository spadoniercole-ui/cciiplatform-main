// src/lib/demo/pdfDemo.ts
//
// I PDF dei documenti demo, generati nel browser con jsPDF (stessa libreria
// già usata per la proposta e i report). Non sono atti veri: ogni pagina
// porta la filigrana «DEMO» e l'intestazione «DOCUMENTO DEMO — NON VALIDO AI
// FINI DI LEGGE». La filigrana non è un dettaglio grafico: senza, un decreto
// sintetico ma verosimile potrebbe essere scambiato per un provvedimento
// reale una volta scaricato dal browser.

import jsPDF from 'jspdf';
import type { AziendaDemo, DocumentoDemo } from './setGiudice';

export function creaPdfDemo(documento: DocumentoDemo, azienda: AziendaDemo): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margine = 18;
  const larghezza = 210 - margine * 2;
  let y = 20;

  const nuovaPagina = () => {
    doc.addPage();
    y = 20;
  };

  const scrivi = (testo: string, opzioni?: { grassetto?: boolean; corpo?: number }) => {
    doc.setFont('helvetica', opzioni?.grassetto ? 'bold' : 'normal');
    doc.setFontSize(opzioni?.corpo ?? 10);
    const righe = doc.splitTextToSize(testo, larghezza) as string[];
    for (const riga of righe) {
      if (y > 275) nuovaPagina();
      doc.text(riga, margine, y);
      y += 5.2;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(documento.titolo, margine, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(azienda.ragioneSociale, margine, y);
  y += 9;

  for (const riga of documento.righe) {
    if (riga.trim() === '') {
      y += 3;
      continue;
    }
    const èTitolo = /^[A-Z][A-Z\sÀÈÉÌÒÙ’'—-]{4,}$/.test(riga.trim());
    scrivi(riga, èTitolo ? { grassetto: true, corpo: 9 } : undefined);
  }

  const pagine = doc.getNumberOfPages();
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i);
    doc.setTextColor(205, 205, 205);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(56);
    doc.text('DEMO', 105, 150, { align: 'center', angle: 45 });
    doc.setTextColor(180, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('DOCUMENTO DEMO — NON VALIDO AI FINI DI LEGGE', 105, 8, { align: 'center' });
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Pagina ${i} di ${pagine}`, 105, 290, { align: 'center' });
  }

  return doc.output('blob');
}
