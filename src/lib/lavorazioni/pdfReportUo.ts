// src/lib/lavorazioni/pdfReportUo.ts
//
// IL FOGLIO CHE VA ALL'UNITÀ OPERATIVA.
//
// Un PDF per ufficio (dipendenza), generato nel browser con jsPDF +
// jspdf-autotable — le stesse librerie del documento per reparto, quindi
// nessuna dipendenza nuova. Dentro, per ogni CODICE di partita: la materia, il
// totale, le inadempienze che lo compongono e le lavorazioni configurate, con i
// passi e l'esito.
//
// PERCHÉ L'ORDINE È QUESTO. Chi riceve il foglio non deve ricostruire niente:
// legge il codice, vede di che partita si tratta, trova subito che cosa deve
// fare e sotto i periodi che lo dimostrano. Il codice prima delle posizioni,
// non il contrario: è il codice che dice la procedura, la posizione è la prova.
//
// Non passa da una rotta server: i dati sono già sul client — quelli appena
// calcolati dal triage o ricomposti alla riapertura — e un documento che si
// scarica non deve poter restituire posizioni diverse da quelle mostrate a
// schermo.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formattaImportoEuro } from './comunicazioni';
import type { DocumentoUo } from './reportUo';

function dataItaliana(dataIso: string): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dataIso;
  return d.toLocaleDateString('it-IT', { timeZone: 'UTC' });
}

/** Sotto questa coordinata una tabella lascerebbe il contenuto fuori dal foglio. */
const LIMITE_PAGINA = 262;

export function generaPdfReportUo(d: DocumentoUo): jsPDF {
  const doc = new jsPDF();
  const data = dataItaliana(d.dataVerifica);
  // Le voci senza codice di partita (raggruppate per materia) sono elencate
  // nello stesso foglio: contarli come codici farebbe credere all'ufficio che
  // esistano codici che non ci sono.
  const codiciNoti = d.codici.filter((c) => c.codice).length;
  const vociSenzaCodice = d.codici.length - codiciNoti;

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Report per unità operativa', 14, 18);
  doc.setFontSize(11);
  doc.text(`Posizione debitoria — ${d.azienda}`, 14, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 33;
  doc.text(`Unità operativa: ${d.dipendenza}`, 14, y);
  y += 5;
  doc.text(`Verifica riferita al ${data}`, 14, y);
  y += 5;
  doc.text(
    `Codici elencati: ${codiciNoti}${
      vociSenzaCodice > 0 ? ` — voci senza codice: ${vociSenzaCodice}` : ''
    } — posizioni ${d.righe} — totale ${formattaImportoEuro(d.totale)}`,
    14,
    y
  );
  y += 5;
  // La versione sta in chiaro sul foglio: è ciò che permette, quando arriva una
  // posizione aggiornata, di dire all'ufficio «quel PDF è la versione X».
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
  y += 2;

  d.codici.forEach((c, indice) => {
    if (y > LIMITE_PAGINA - 20) {
      doc.addPage();
      y = 22;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(
      `${indice + 1}. ${
        c.codice ? `Codice ${c.codice}` : 'Senza codice di partita'
      }${c.materia ? ` — ${c.materia}` : ''}`,
      14,
      y
    );
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `${c.righe} ${c.righe === 1 ? 'inadempienza' : 'inadempienze'} — ${formattaImportoEuro(
        c.importo
      )}`,
      14,
      y
    );
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Posizione V.E.R.A.', 'Periodo', 'Stato', 'Natura', 'Importo']],
      body: c.inadempienze.map((i) => [
        `${i.sezione} — ${i.voce}`,
        i.periodo ?? '—',
        i.stato || '—',
        i.trattamento,
        formattaImportoEuro(i.importo),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [30, 41, 59] },
      // Le larghezze coprono esattamente i 182 mm utili (A4 210 meno 14 per
      // lato): una tabella più larga fa sparire l'ultima colonna — quella
      // degli importi, la prima che si guarda.
      columnStyles: {
        0: { cellWidth: 72 },
        1: { cellWidth: 28 },
        2: { cellWidth: 26 },
        3: { cellWidth: 28 },
        4: { cellWidth: 28, halign: 'right' },
      },
      theme: 'grid',
    });

    // @ts-expect-error jspdf-autotable estende jsPDF con questa proprietà a runtime
    y = doc.lastAutoTable.finalY + 6;
    if (y > LIMITE_PAGINA) {
      doc.addPage();
      y = 22;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Lavorazioni da svolgere', 14, y);
    y += 4;

    if (c.lavorazioni.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      const nota = doc.splitTextToSize(
        'Nessuna lavorazione configurata per questa voce: va indicata la procedura di recupero nei parametri dell’ente.',
        182
      ) as string[];
      doc.text(nota, 14, y);
      y += nota.length * 3.6 + 4;
      return;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Lavorazione', 'Procedura', 'Esito']],
      body: c.lavorazioni.map((l) => [l.tipologia, l.procedura ?? '—', l.esito ?? '—']),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [71, 85, 105] },
      columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 100 }, 2: { cellWidth: 34 } },
      theme: 'grid',
    });
    // @ts-expect-error jspdf-autotable estende jsPDF con questa proprietà a runtime
    y = doc.lastAutoTable.finalY + 8;
  });

  if (y > LIMITE_PAGINA) {
    doc.addPage();
    y = 22;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const chiusura = doc.splitTextToSize(
    'Il totale di ogni voce (codice di partita, o materia quando il codice non c’è) è la somma delle sue ' +
      'inadempienze: i debiti che risultano dai documenti ' +
      `dell’ente alla data della verifica (${data}). Non è l’accertamento della singola partita, che resta ` +
      'in capo all’ufficio. Le posizioni sospese o fuori perimetro non sono elencate e non entrano nei ' +
      'totali. Le lavorazioni sono quelle configurate per la materia della voce. Il documento non viene ' +
      'trasmesso dalla piattaforma: l’invio all’ufficio è a cura di chi lo scarica, e lo scaricamento ' +
      'registrato è la dichiarazione di chi lo ha effettuato.',
    182
  ) as string[];
  doc.text(chiusura, 14, y);
  y += chiusura.length * 3.6 + 2;
  doc.text(`Documento generato il ${new Date().toLocaleDateString('it-IT')}.`, 14, y);

  // Piè di pagina su ogni pagina: un foglio sciolto, senza azienda e data, in
  // un ufficio diventa un allegato di cui non si sa più a cosa si riferisce.
  const pagine = doc.getNumberOfPages();
  for (let i = 1; i <= pagine; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `${d.azienda} — ${d.dipendenza} — verifica al ${data} — versione ${d.versione}`,
      14,
      290
    );
    doc.text(`pagina ${i} di ${pagine}`, 196, 290, { align: 'right' });
  }

  return doc;
}

/** Genera e scarica il PDF dell'unità operativa. */
export function scaricaPdfReportUo(d: DocumentoUo): void {
  generaPdfReportUo(d).save(d.nomeFile);
}
