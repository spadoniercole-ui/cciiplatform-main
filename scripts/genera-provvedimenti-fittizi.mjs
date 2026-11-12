// DUE PROVVEDIMENTI FITTIZI PER IL COLLAUDO DEL PERCORSO RICEVENTE.
//
// Servono a provare gli scenari di liquidazione giudiziale e di cram down, che
// si basano sulla sola verifica amministrativa. I documenti sono PDF veri, con
// la struttura che il lettore del provvedimento cerca: data dell'atto, crediti
// ammessi o riconosciuti con rango, percentuale di soddisfacimento o realizzo,
// spese di procedura e tempi.
//
// NON SONO ATTI REALI: ogni pagina porta la dicitura «documento fittizio» e i
// dati sono inventati, coerenti solo con l'azienda di prova SANMICHELE S.R.L.
//
//   node scripts/genera-provvedimenti-fittizi.mjs
//
// Scrive in documenti/, che non va committato insieme ai dati veri.

import { mkdirSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const MARGINE = 48;
const LARGHEZZA = 595.28; // A4 in punti
const ALTEZZA = 841.89;

const euro = (n) =>
  `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const DEBITORE = {
  ragioneSociale: 'SANMICHELE S.R.L.',
  partitaIva: '08823480960',
  codiceFiscale: '08823480960',
  sede: 'Via dei Tessitori 14, 40138 Bologna (BO)',
};

const CREDITI = [
  {
    voce: 'Spese di procedura e compensi (prededucibili)',
    importo: 38000,
    rango: 'PREDEDUCIBILE',
    privilegio: '—',
  },
  {
    voce: 'INPS — contributi previdenziali e sanzioni',
    importo: 312434,
    rango: 'PRIVILEGIATO',
    privilegio: 'Privilegio generale ex art. 2752 c.c.',
  },
  {
    voce: 'Agenzia delle Entrate — IVA, ritenute e sanzioni',
    importo: 148900,
    rango: 'PRIVILEGIATO',
    privilegio: 'Privilegio ex art. 2752 c.c.',
  },
  {
    voce: 'Banca Popolare dell’Emilia — mutuo fondiario',
    importo: 420000,
    rango: 'PRIVILEGIATO',
    privilegio: 'Ipoteca volontaria sull’immobile di Via dei Tessitori 14',
  },
  {
    voce: 'Fornitori diversi — fatture non pagate',
    importo: 265100,
    rango: 'CHIROGRAFARIO',
    privilegio: '—',
  },
  { voce: 'Finanziamenti dei soci', importo: 95000, rango: 'POSTERGATO', privilegio: '—' },
];

const TOTALE = CREDITI.reduce((s, c) => s + c.importo, 0);

function intestazione(doc, sottotitolo, dicitura) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, LARGHEZZA, 86, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TRIBUNALE DI BOLOGNA', MARGINE, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Sezione procedure concorsuali — volontaria giurisdizione', MARGINE, 50);
  doc.setFontSize(8);
  doc.text(dicitura, MARGINE, 68);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(sottotitolo, LARGHEZZA - MARGINE, 34, { align: 'right' });

  doc.setTextColor(30, 41, 59);
}

function schedaAtto(doc, y, righe) {
  autoTable(doc, {
    startY: y,
    margin: { left: MARGINE, right: MARGINE },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3, textColor: [51, 65, 85] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130 } },
    body: righe,
  });
  return doc.lastAutoTable.finalY + 10;
}

function tabellaCrediti(doc, y, percentuali) {
  autoTable(doc, {
    startY: y,
    margin: { left: MARGINE, right: MARGINE },
    head: [['Creditore / voce di credito', 'Importo', 'Rango', 'Privilegio', '% realizzo']],
    body: CREDITI.map((c) => [
      c.voce,
      euro(c.importo),
      c.rango,
      c.privilegio,
      percentuali[c.rango] === undefined ? '—' : `${percentuali[c.rango]}%`,
    ]),
    foot: [['Totale crediti ammessi', euro(TOTALE), '', '', '']],
    styles: { fontSize: 8, cellPadding: 4, textColor: [51, 65, 85], valign: 'middle' },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    // Le colonne si dimensionano da sole; solo importo e percentuale hanno una
    // larghezza fissa, per allineare i numeri a destra.
    columnStyles: {
      1: { halign: 'right', cellWidth: 74 },
      4: { halign: 'right', cellWidth: 54 },
    },
  });
  return doc.lastAutoTable.finalY + 14;
}

function sezione(doc, y, titolo, paragrafi) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 95);
  doc.text(titolo.toUpperCase(), MARGINE, y);
  let cursor = y + 14;
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const paragrafo of paragrafi) {
    const righe = doc.splitTextToSize(paragrafo, LARGHEZZA - MARGINE * 2);
    doc.text(righe, MARGINE, cursor);
    cursor += righe.length * 12 + 8;
  }
  return cursor + 4;
}

function piedi(doc) {
  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGINE, ALTEZZA - 50, LARGHEZZA - MARGINE, ALTEZZA - 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Documento fittizio generato per il collaudo della piattaforma: non è un provvedimento reale e i dati sono inventati.',
      MARGINE,
      ALTEZZA - 36
    );
    doc.text(`pagina ${p} di ${pagine}`, LARGHEZZA - MARGINE, ALTEZZA - 36, { align: 'right' });
  }
}

function costruisci({
  file,
  oggetto,
  dicitura,
  datiAtto,
  premessa,
  dispositivo,
  percentuali,
  spesePct,
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setProperties({
    title: oggetto,
    subject: 'Documento fittizio per collaudo',
    author: 'CCIIplatform — ambiente di prova',
    creator: 'CCIIplatform',
  });

  intestazione(doc, 'Documento fittizio · uso interno', dicitura);

  let y = 118;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const titolo = doc.splitTextToSize(oggetto, LARGHEZZA - MARGINE * 2);
  doc.text(titolo, MARGINE, y);
  y += titolo.length * 17 + 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Il testo che segue è una riproduzione sintetica a scopo di test: riporta i dati che la lettura automatica deve estrarre.',
    MARGINE,
    y
  );
  y += 22;

  y = schedaAtto(doc, y, datiAtto);
  y = sezione(doc, y, 'Premessa', premessa);
  y = sezione(doc, y, 'Crediti', [
    'Il quadro dei crediti ammessi o riconosciuti, con il rango e la percentuale di realizzo o di soddisfacimento prevista, è il seguente.',
  ]);
  y = tabellaCrediti(doc, y, percentuali);
  y = sezione(doc, y, 'Spese e tempi', [
    `Spese di procedura stimate nella misura del ${spesePct}% del realizzo lordo. Durata stimata della procedura: ${datiAtto.find((r) => r[0] === 'Tempi').slice(1)[0]}.`,
  ]);
  y = sezione(doc, y, 'Dispositivo', dispositivo);

  piedi(doc);
  doc.save(file);
  return file;
}

mkdirSync('documenti', { recursive: true });

costruisci({
  file: 'documenti/Provvedimento_fittizio_liquidazione_giudiziale.pdf',
  oggetto: 'Decreto di apertura della liquidazione giudiziale',
  dicitura: 'DOCUMENTO FITTIZIO — NON È UN ATTO REALE',
  datiAtto: [
    ['Numero di ruolo', 'RG 142/2026 — procedure concorsuali'],
    ['Giudice delegato', 'Dott.ssa Elena Marchetti'],
    ['Curatore', 'Dott. Paolo Rinaldi'],
    ['Data dell’atto', '2026-10-12'],
    ['Debitore', DEBITORE.ragioneSociale],
    ['Partita IVA / C.F.', `${DEBITORE.partitaIva} — ${DEBITORE.codiceFiscale}`],
    ['Sede legale', DEBITORE.sede],
    ['Tempi', '42 mesi'],
  ],
  premessa: [
    'Letto il ricorso depositato in data 2026-09-28 e la documentazione allegata; esaminata la relazione dell’esperto; rilevata la sussistenza dei presupposti di cui agli articoli 1 e 2 del Codice della crisi d’impresa e dell’insolvenza;',
    'il Tribunale, in composizione collegiale, dichiara aperta la procedura di liquidazione giudiziale nei confronti della società indicata in epigrafe e nomina il giudice delegato e il curatore sopra indicati. I crediti ammessi o riconosciuti e il realizzo previsto sono quelli riportati nella tabella che segue.',
  ],
  dispositivo: [
    'Dichiara aperta la liquidazione giudiziale di SANMICHELE S.R.L.; ordina al debitore la consegna dei beni e dei documenti al curatore; fissa il termine di giorni sessanta per il deposito dell’elenco dei creditori e delle scritture contabili.',
    'Il realizzo indicato nella tabella è una stima ai fini della procedura: le percentuali effettive dipenderanno dal ricavato della vendita e dal riparto.',
  ],
  percentuali: { PREDEDUCIBILE: 100, PRIVILEGIATO: 62, CHIROGRAFARIO: 18, POSTERGATO: 0 },
  spesePct: 12,
});

costruisci({
  file: 'documenti/Provvedimento_fittizio_cram_down.pdf',
  oggetto: 'Provvedimento di omologazione del piano — cram down',
  dicitura: 'DOCUMENTO FITTIZIO — NON È UN ATTO REALE',
  datiAtto: [
    ['Numero di ruolo', 'RG 205/2026 — procedure concorsuali'],
    ['Giudice delegato', 'Dott. Andrea Falcone'],
    ['Professionista attestatore', 'Dott.ssa Chiara Bellini'],
    ['Data dell’atto', '2026-10-28'],
    ['Debitore', DEBITORE.ragioneSociale],
    ['Partita IVA / C.F.', `${DEBITORE.partitaIva} — ${DEBITORE.codiceFiscale}`],
    ['Sede legale', DEBITORE.sede],
    ['Tempi', '36 mesi'],
  ],
  premessa: [
    'Visto il ricorso per l’omologazione del piano depositato in data 2026-10-05; lette la relazione dell’attestatore e le adesioni raccolte; considerato che il piano soddisfa i creditori dissenzienti in misura non deteriore rispetto alle alternative praticabili;',
    'il Tribunale omologa il piano e lo rende efficace nei confronti di tutti i creditori, compresi quelli che non hanno espresso il consenso. Non si tratta di un accordo votato: l’efficacia deriva dal presente provvedimento.',
  ],
  dispositivo: [
    'Omologa il piano come proposto e ne dichiara l’efficacia nei confronti dei creditori anteriori; le percentuali di soddisfacimento riconosciute a ciascuna classe sono quelle indicate nella tabella; fissa in trentasei mesi il termine per l’esecuzione del piano.',
    'Le percentuali indicate sono quelle riconosciute dal provvedimento: il confronto con la liquidazione si fa su queste, non su quanto l’azienda aveva proposto.',
  ],
  percentuali: { PREDEDUCIBILE: 100, PRIVILEGIATO: 74, CHIROGRAFARIO: 22, POSTERGATO: 0 },
  spesePct: 9,
});

console.log('Provvedimenti fittizi generati in documenti/.');
