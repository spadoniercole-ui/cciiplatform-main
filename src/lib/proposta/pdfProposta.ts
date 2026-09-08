// src/lib/proposta/pdfProposta.ts
//
// Documento stampabile della Proposta, per la versione "Da definire"
// (quella che lo studio/l'azienda deve INVIARE a enti e creditori — la
// versione "Ricevuta" non ha bisogno di essere "spedita", è già stata
// ricevuta). Interamente lato client con jsPDF + jspdf-autotable, stesse
// librerie già usate in src/lib/xbrl/reportExport.ts.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Azienda } from '@/app/actions/aziende';
import type { RigaProposta } from '@/app/actions/propostaScenario';
import { raggruppaPerRango, etichettaRango } from './rangoLegale';

function formattaEuro(val: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
}

function nomeFileSicuro(testo: string): string {
  return (testo || 'proposta')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export interface DatiDocumentoProposta {
  azienda: Azienda;
  nomeScenario: string;
  righe: RigaProposta[];
}

export function generaDocumentoPropostaPdf(dati: DatiDocumentoProposta): void {
  const { azienda, nomeScenario, righe } = dati;
  const doc = new jsPDF();

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Proposta di accordo transattivo', 14, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    '(ai sensi degli artt. 23 e 63 CCII — bozza di lavoro, da rivedere prima dell’invio)',
    14,
    24
  );

  let y = 34;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Impresa proponente', 14, y);
  doc.setFont('helvetica', 'normal');
  y += 6;

  const rigaAnagrafica = (etichetta: string, valore: string | null | undefined) => {
    if (!valore) return;
    doc.text(`${etichetta}: ${valore}`, 14, y);
    y += 5;
  };

  rigaAnagrafica(
    'Ragione sociale',
    `${azienda.ragioneSociale}${azienda.formaGiuridica ? ` — ${azienda.formaGiuridica}` : ''}`
  );
  rigaAnagrafica('Sede legale', formattaIndirizzo(azienda));
  rigaAnagrafica('C.F.', azienda.codiceFiscale);
  rigaAnagrafica('P.IVA', azienda.partitaIva);
  rigaAnagrafica(
    'Capitale sociale',
    azienda.capitaleSociale !== null ? formattaEuro(azienda.capitaleSociale) : null
  );
  rigaAnagrafica('Numero REA', azienda.numeroRea);
  rigaAnagrafica(
    azienda.ruoloRappresentanteLegale || 'Rappresentante legale',
    azienda.rappresentanteLegale
  );
  rigaAnagrafica('PEC', azienda.pec);

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text(`Scenario: ${nomeScenario}`, 14, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Proposta ai creditori', 14, y);

  autoTable(doc, {
    startY: y + 3,
    head: [['Categoria creditore', 'Rango', 'Dovuto', 'Offerta', 'Modalità', 'Note']],
    body: righe.map((r) => [
      r.categoriaCreditore,
      etichettaRango(r.rangoLegale),
      formattaEuro(r.importoDovuto),
      `${r.percentualeOfferta}%`,
      r.modalita === 'UNICA_SOLUZIONE'
        ? 'Unica soluzione'
        : `Rateale${r.numeroRate ? ` (${r.numeroRate} rate)` : ''}`,
      r.note || '',
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    theme: 'grid',
  });

  // @ts-expect-error jspdf-autotable estende jsPDF con questa proprietà a runtime
  y = doc.lastAutoTable.finalY + 8;

  const riepilogoRango = raggruppaPerRango(righe);
  if (riepilogoRango.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Riepilogo per rango legale', 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [['Rango', 'Creditori', 'Dovuto', 'Offerto']],
      body: riepilogoRango.map((r) => [
        r.etichetta,
        r.creditori.join(', '),
        formattaEuro(r.totaleDovuto),
        formattaEuro(r.totaleOfferto),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [71, 85, 105] },
      theme: 'grid',
    });
    // @ts-expect-error jspdf-autotable estende jsPDF con questa proprietà a runtime
    y = doc.lastAutoTable.finalY + 10;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Documento generato il ${new Date().toLocaleDateString('it-IT')} — bozza di lavoro.`,
    14,
    y
  );
  y += 10;
  doc.text('Luogo e data: ______________________', 14, y);
  y += 16;
  doc.text('Firma: ______________________________', 14, y);

  doc.save(`proposta_${nomeFileSicuro(azienda.ragioneSociale)}.pdf`);
}

function formattaIndirizzo(azienda: Azienda): string | null {
  const parti = [
    azienda.indirizzoSedeLegale,
    azienda.citta ? `${azienda.citta}${azienda.provincia ? ` (${azienda.provincia})` : ''}` : null,
    azienda.cap,
  ].filter(Boolean);
  return parti.length > 0 ? parti.join(', ') : null;
}
