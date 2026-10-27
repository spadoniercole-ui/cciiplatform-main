// src/lib/lavorazioni/pdfReparto.ts
//
// IL DOCUMENTO CHE SI CONSEGNA AL REPARTO.
//
// Un PDF per reparto, generato nel browser con jsPDF + jspdf-autotable —
// le stesse librerie della Proposta e dello Screening, quindi nessuna
// dipendenza nuova. Contiene le due cose che servono a chi deve lavorare il
// debito: l'elenco delle posizioni da trattare e le attività di
// contabilizzazione configurate per le loro tipologie.
//
// Non passa da una rotta server: i dati sono già sul client — sono quelli
// appena calcolati dal triage — e un documento che si scarica non deve
// poter restituire posizioni diverse da quelle mostrate a schermo.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formattaImportoEuro } from './comunicazioni';
import { testiContabilizzate } from './daLavorare';
import type { DocumentoReparto } from './reparti';

function dataItaliana(dataIso: string): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dataIso;
  return d.toLocaleDateString('it-IT', { timeZone: 'UTC' });
}

export function generaPdfReparto(d: DocumentoReparto): jsPDF {
  const doc = new jsPDF();
  const data = dataItaliana(d.dataVerifica);

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Comunicazione ai reparti', 14, 18);
  doc.setFontSize(11);
  doc.text(`Posizione debitoria — ${d.azienda}`, 14, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 33;
  doc.text(`Reparto: ${d.reparto}`, 14, y);
  y += 5;
  doc.text(`Verifica riferita al ${data}`, 14, y);
  y += 5;
  // La versione sta in chiaro sul foglio: è ciò che permette, quando arriva
  // una posizione aggiornata, di dire al reparto «quel PDF è la versione X».
  doc.text(`Posizioni elencate: ${d.righe} — totale ${formattaImportoEuro(d.totale)}`, 14, y);
  y += 5;
  doc.text(`Versione del documento: ${d.versione}`, 14, y);
  y += 5;
  if (d.posizioniDaContabilizzare > 0) {
    doc.text(
      `Di cui non ancora contabilizzate: ${d.posizioniDaContabilizzare} — ${formattaImportoEuro(
        d.importoDaContabilizzare
      )}`,
      14,
      y
    );
    y += 5;
  }
  // Fuori perimetro: dichiarate, non elencate. Un documento che tace sulle
  // posizioni sospese lascia credere che il V.E.R.A. ne contenesse solo
  // quelle elencate, e chi confronta il PDF con la scheda trova una
  // differenza che nessuno spiega.
  // Ciò che è già in contabilità non è un debito da lavorare: si dichiara
  // perché il totale del foglio non è il totale del V.E.R.A. Chi confronta i
  // due numeri trova la spiegazione qui, invece di concludere che manchi roba.
  const notaContabilizzate = testiContabilizzate(d, formattaImportoEuro).documento;
  if (notaContabilizzate) {
    doc.setFontSize(8.5);
    const righeNota = doc.splitTextToSize(notaContabilizzate, 182) as string[];
    doc.text(righeNota, 14, y);
    y += righeNota.length * 4;
    doc.setFontSize(9);
  }
  if (d.posizioniEscluse.righe > 0) {
    doc.text(
      `Fuori perimetro: ${d.posizioniEscluse.righe} ${
        d.posizioniEscluse.righe === 1 ? 'posizione' : 'posizioni'
      } per ${formattaImportoEuro(d.posizioniEscluse.totale)} non elencate (sospese)`,
      14,
      y
    );
    y += 5;
  }
  if (d.oggetto.trim()) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    const oggetto = doc.splitTextToSize(`Oggetto: ${d.oggetto}`, 182) as string[];
    doc.text(oggetto, 14, y);
    y += oggetto.length * 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('1. Debiti da lavorare', 14, y);

  autoTable(doc, {
    startY: y + 3,
    margin: { left: 14, right: 14 },
    head: [['Tipologia', 'Posizione V.E.R.A.', 'Periodo', 'Natura', 'Importo']],
    body: d.posizioni.map((p) => [
      p.categoria,
      `${p.sezione} — ${p.voce}`,
      p.periodo ?? '—',
      p.trattamento,
      formattaImportoEuro(p.importo),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    // Margini espliciti e larghezze che coprono ESATTAMENTE i 182 mm utili
    // (A4 210 meno 14 per lato): una tabella più larga fa sparire l'ultima
    // colonna — proprio quella degli importi, che è la prima cosa che si
    // guarda — e una più stretta lascia un margine irregolare.
    columnStyles: {
      0: { cellWidth: 33 },
      1: { cellWidth: 65 },
      2: { cellWidth: 26 },
      3: { cellWidth: 28 },
      4: { cellWidth: 30, halign: 'right' },
    },
    theme: 'grid',
  });

  // @ts-expect-error jspdf-autotable estende jsPDF con questa proprietà a runtime
  y = doc.lastAutoTable.finalY + 6;
  // Se la tabella finisce in fondo alla pagina, totale e sezione 2
  // finirebbero sotto il bordo o sopra il piè di pagina: si gira pagina.
  if (y > 265) {
    doc.addPage();
    y = 24;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Totale delle posizioni elencate: ${formattaImportoEuro(d.totale)}`, 14, y);
  y += 9;

  doc.setFontSize(10);
  doc.text('2. Attività da svolgere per la contabilizzazione', 14, y);

  autoTable(doc, {
    startY: y + 3,
    margin: { left: 14, right: 14 },
    head: [['Attività', 'Tipologie di debito']],
    body: d.attivita.map((a) => [a.lavorazione, a.categorie.join(', ')]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [71, 85, 105] },
    columnStyles: { 0: { cellWidth: 108 }, 1: { cellWidth: 74 } },
    theme: 'grid',
  });

  // @ts-expect-error jspdf-autotable estende jsPDF con questa proprietà a runtime
  y = doc.lastAutoTable.finalY + 8;

  // La nota finale è un blocco di più righe: se non c'è spazio si porta
  // sulla pagina nuova invece di scriverla sopra il piè di pagina.
  if (y > 262) {
    doc.addPage();
    y = 24;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const nota = doc.splitTextToSize(
    'Il totale è la somma delle posizioni elencate: i debiti da contabilizzare che risultano dai ' +
      `documenti dell’ente alla data della verifica (${data}). Non è l’accertamento della singola ` +
      'partita, che resta in capo al reparto. Le posizioni già contabilizzate sono dichiarate qui ' +
      'sopra e non elencate; quelle sospese o fuori perimetro non sono elencate e non entrano nel ' +
      'totale. Il documento non viene trasmesso dalla piattaforma: l’invio al ' +
      'reparto è a cura dell’ufficio che lo scarica, e lo scaricamento registrato dalla ' +
      'piattaforma è la dichiarazione di chi lo ha effettuato.',
    182
  ) as string[];
  doc.text(nota, 14, y);
  y += nota.length * 3.6 + 2;
  doc.text(`Documento generato il ${new Date().toLocaleDateString('it-IT')}.`, 14, y);

  // Piè di pagina su ogni pagina: un foglio sciolto, senza azienda e data,
  // in un ufficio diventa un allegato di cui non si sa più a cosa si riferisce.
  const pagine = doc.getNumberOfPages();
  for (let i = 1; i <= pagine; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`${d.azienda} — ${d.reparto} — verifica al ${data} — versione ${d.versione}`, 14, 290);
    doc.text(`pagina ${i} di ${pagine}`, 196, 290, { align: 'right' });
  }

  return doc;
}

/** Genera e scarica il PDF del reparto. */
export function scaricaPdfReparto(d: DocumentoReparto): void {
  generaPdfReparto(d).save(d.nomeFile);
}
