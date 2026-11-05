// scripts/genera-demo-files.mjs
//
// Genera i documenti statici della demo in public/demo. Non fa parte del
// runtime: si esegue una volta quando cambiano i dati del percorso demo.
// Ogni PDF porta la filigrana DEMO e la dicitura «documento fittizio»; gli
// Excel hanno la stessa intestazione nel primo foglio.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

const CARTELLA = join(process.cwd(), 'public', 'demo');
mkdirSync(CARTELLA, { recursive: true });

const aziende = [
  {
    chiave: 'meccanica-valsesia',
    nome: 'Meccanica Valsesia Demo S.r.l.',
    cf: '00000000101',
    piva: '00000000101',
    rea: 'PV-001101',
    forma: 'Società a responsabilità limitata',
    sede: 'Via delle Officine 18, 27029 Vigevano (PV)',
    pec: 'meccanica.valsesia.demo@pec.esempio.it',
    ateco: '25.62.00',
    amministratore: 'Paolo Esempio, Amministratore unico',
    addetti: 24,
    oggetto: 'Lavorazione meccanica di precisione per conto terzi.',
  },
  {
    chiave: 'tessitura-lario',
    nome: 'Tessitura Lario Demo S.p.A.',
    cf: '00000000102',
    piva: '00000000102',
    rea: 'CO-001102',
    forma: 'Società per azioni',
    sede: 'Via del Setificio 7, 22100 Como (CO)',
    pec: 'tessitura.lario.demo@pec.esempio.it',
    ateco: '13.20.00',
    amministratore: 'Laura Esempio, Amministratrice delegata',
    addetti: 62,
    oggetto: 'Tessitura e nobilitazione di filati per l’abbigliamento.',
  },
  {
    chiave: 'logistica-padana',
    nome: 'Logistica Padana Demo S.r.l.',
    cf: '00000000103',
    piva: '00000000103',
    rea: 'PC-001103',
    forma: 'Società a responsabilità limitata',
    sede: 'Via della Logistica 41, 29122 Piacenza (PC)',
    pec: 'logistica.padana.demo@pec.esempio.it',
    ateco: '52.29.00',
    amministratore: 'Chiara Esempio, Amministratrice unica',
    addetti: 31,
    oggetto: 'Trasporto merci conto terzi e gestione di magazzini.',
  },
  {
    chiave: 'cantieri-brianza',
    nome: 'Cantieri Brianza Demo S.r.l.',
    cf: '00000000104',
    piva: '00000000104',
    rea: 'MB-001104',
    forma: 'Società a responsabilità limitata',
    sede: 'Via del Lambro 22, 20900 Monza (MB)',
    pec: 'cantieri.brianza.demo@pec.esempio.it',
    ateco: '41.20.00',
    amministratore: 'Marco Esempio, Amministratore unico',
    addetti: 38,
    oggetto: 'Costruzione di edifici residenziali e commerciali.',
  },
];

function pdf({ file, titolo, sottotitolo, righe }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 0;

  const pagina = () => {
    doc.setFillColor(254, 243, 199);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(146, 64, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('DEMO — DOCUMENTO FITTIZIO, SENZA VALORE LEGALE', 15, 9);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Generato esclusivamente per la dimostrazione della piattaforma CCII', 15, 14);

    doc.setTextColor(215, 215, 215);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(96);
    doc.text('DEMO', 18, 175, { angle: 35 });

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(titolo, 15, 34);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(sottotitolo, 15, 41);
    doc.setDrawColor(203, 213, 225);
    doc.line(15, 45, 195, 45);
    y = 53;
  };

  const nuovaPagina = () => {
    doc.addPage();
    pagina();
  };

  pagina();
  for (const riga of righe) {
    if (riga === '---') {
      doc.setDrawColor(226, 232, 240);
      doc.line(15, y, 195, y);
      y += 5;
      continue;
    }
    if (riga.startsWith('## ')) {
      if (y > 265) nuovaPagina();
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(riga.slice(3), 15, y);
      y += 6;
      continue;
    }
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const linee = doc.splitTextToSize(riga, 175);
    for (const linea of linee) {
      if (y > 278) nuovaPagina();
      doc.text(linea, 15, y);
      y += 5;
    }
    y += 1;
  }

  const totale = doc.getNumberOfPages();
  for (let i = 1; i <= totale; i++) {
    doc.setPage(i);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.text(`DEMO · pagina ${i} di ${totale}`, 15, 290);
  }

  writeFileSync(join(CARTELLA, file), Buffer.from(doc.output('arraybuffer')));
}

function excel({ file, titolo, azienda, righe }) {
  const wb = XLSX.utils.book_new();
  const dati = [
    ['DEMO — DOCUMENTO FITTIZIO, SENZA VALORE LEGALE'],
    [titolo],
    [azienda],
    [],
    ...righe,
  ];
  const ws = XLSX.utils.aoa_to_sheet(dati);
  ws['!cols'] = [{ wch: 46 }, { wch: 18 }, { wch: 18 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Dati demo');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(join(CARTELLA, file), buffer);
}

for (const a of aziende) {
  pdf({
    file: `fascicolo-storico-${a.chiave}.pdf`,
    titolo: 'Fascicolo storico e visura camerale',
    sottotitolo: a.nome,
    righe: [
      '## Dati identificativi',
      `Denominazione: ${a.nome}`,
      `Codice fiscale / Partita IVA: ${a.cf} / ${a.piva}`,
      `Forma giuridica: ${a.forma}`,
      `Sede legale: ${a.sede}`,
      `Numero REA: ${a.rea}`,
      `PEC: ${a.pec}`,
      `Codice ATECO: ${a.ateco}`,
      `Amministrazione: ${a.amministratore}`,
      `Addetti: ${a.addetti}`,
      '---',
      '## Oggetto sociale',
      a.oggetto,
      '---',
      '## Iscrizioni e procedure',
      'Stato attività: ATTIVA.',
      'Procedure concorsuali in corso: nessuna risultante dalla visura demo.',
      'Bilanci depositati: esercizi 2023, 2024 e 2025.',
      '---',
      '## Avvertenza',
      'Questo fascicolo è un documento dimostrativo. I dati sono inventati e non corrispondono a imprese reali. La filigrana DEMO è ripetuta su ogni pagina.',
    ],
  });

  excel({
    file: `bilancio-${a.chiave}-2025.xlsx`,
    titolo: 'Bilancio 2025 — prospetto dimostrativo',
    azienda: a.nome,
    righe: [
      ['Voce', '2025', '2024', 'Nota'],
      ['Ricavi delle vendite', 1200000, 1350000, 'Dati fittizi'],
      ['Valore della produzione', 1350000, 1500000, 'Dati fittizi'],
      ['Costi della produzione', 1290000, 1420000, 'Dati fittizi'],
      ['EBITDA', 100000, 125000, 'Dati fittizi'],
      ['EBIT', 60000, 80000, 'Dati fittizi'],
      ['Oneri finanziari', 55000, 50000, 'Dati fittizi'],
      ['Utile (perdita) dell’esercizio', 5000, 15000, 'Dati fittizi'],
      ['Totale attivo', 1100000, 1200000, 'Dati fittizi'],
      ['Patrimonio netto', 55000, 100000, 'Dati fittizi'],
      ['Totale debiti', 900000, 880000, 'Dati fittizi'],
    ],
  });

  if (a.chiave === 'meccanica-valsesia') {
    pdf({
      file: 'proposta-meccanica-valsesia.pdf',
      titolo: 'Proposta di concordato',
      sottotitolo: a.nome,
      righe: [
        '## Proposta ricevuta dall’ente',
        'La società propone un concordato con soddisfacimento dei creditori secondo le percentuali indicate nella tabella allegata.',
        '---',
        '## Categorie e percentuali',
        'Creditori privilegiati: 30,5% del dovuto, in quattro rate annuali.',
        'Creditori chirografari: 6,4% del dovuto, in sei rate annuali.',
        'Debiti verso l’ente: 245.000,00 euro complessivi, come da posizione debitoria.',
        '---',
        '## Condizioni dichiarate',
        'Continuità aziendale, mantenimento dei livelli occupazionali e pagamento dei crediti in prededuzione entro la data di omologazione.',
        'La proposta è dimostrativa e non ha valore legale.',
      ],
    });
  }

  if (a.chiave === 'tessitura-lario') {
    pdf({
      file: 'decreto-liquidazione-tessitura-lario.pdf',
      titolo: 'Decreto di liquidazione giudiziale',
      sottotitolo: 'Tribunale di Como — Sezione crisi d’impresa · procedura demo',
      righe: [
        '## Il Tribunale',
        'Visto il ricorso e la documentazione allegata, dichiara aperta la liquidazione giudiziale della società Tessitura Lario Demo S.p.A. e nomina il giudice delegato e il curatore.',
        '---',
        '## Crediti ammessi',
        'Contributi previdenziali scaduti: ammesso 72.000,00 euro, rango privilegiato, realizzo previsto 30,5%.',
        'Sanzioni civili contributive: ammesso 8.000,00 euro, rango chirografario, realizzo previsto 6,4%.',
        '---',
        '## Spese e tempi',
        'Spese di procedura: 20% del realizzo lordo.',
        'Durata stimata: 36 mesi.',
        '---',
        '## Avvertenza',
        'Atto dimostrativo. I crediti, le percentuali e i tempi sono inventati per mostrare il confronto con la posizione dell’ente.',
      ],
    });
    pdf({
      file: 'stato-passivo-tessitura-lario.pdf',
      titolo: 'Stato passivo — allegato al decreto',
      sottotitolo: 'Tessitura Lario Demo S.p.A. · procedura demo',
      righe: [
        '## Crediti dello Stato e degli enti',
        'Contributi previdenziali scaduti — 72.000,00 euro — privilegiato.',
        'Sanzioni civili contributive — 8.000,00 euro — chirografario.',
        '---',
        '## Altri crediti',
        'Fornitori: 420.000,00 euro — chirografario.',
        'Banche: 510.000,00 euro — privilegiato ipotecario.',
        '---',
        '## Avvertenza',
        'Documento dimostrativo: non riproduce uno stato passivo reale.',
      ],
    });
  }

  if (a.chiave === 'logistica-padana') {
    pdf({
      file: 'dispositivo-cram-down-logistica-padana.pdf',
      titolo: 'Dispositivo di cram down',
      sottotitolo: 'Tribunale di Piacenza — Sezione crisi d’impresa · procedura demo',
      righe: [
        '## Il Tribunale',
        'Omologa il piano di ristrutturazione e dispone il cram down nei confronti dei creditori dissenzienti, nei termini indicati nel dispositivo.',
        '---',
        '## Crediti riconosciuti',
        'Contributi previdenziali scaduti: riconosciuto 10.000,00 euro, rango privilegiato, soddisfacimento 50%.',
        'Sanzioni civili contributive: riconosciuto 1.000,00 euro, rango chirografario, soddisfacimento 20%.',
        '---',
        '## Spese e tempi',
        'Spese di procedura: 15% del realizzo lordo.',
        'Durata stimata: 24 mesi.',
        '---',
        '## Avvertenza',
        'Dispositivo dimostrativo. I dati sono inventati e servono solo al confronto con la posizione dell’ente.',
      ],
    });
  }

  if (a.chiave === 'cantieri-brianza') {
    pdf({
      file: 'proposta-cantieri-brianza.pdf',
      titolo: 'Proposta depositata — variante aperta',
      sottotitolo: a.nome,
      righe: [
        '## Proposta ricevuta dall’ente',
        'La società ha depositato una proposta di ristrutturazione, ma il percorso non è ancora qualificato: la demo lascia aperta la scelta tra proposta, liquidazione e cram down.',
        '---',
        '## Condizioni dichiarate',
        'Continuità aziendale e pagamento dei creditori secondo il piano allegato. Il documento è una variante dimostrativa, non un atto reale.',
      ],
    });
    pdf({
      file: 'decreto-liquidazione-cantieri-brianza.pdf',
      titolo: 'Decreto di liquidazione giudiziale — variante',
      sottotitolo: 'Tribunale di Monza — Sezione crisi d’impresa · procedura demo',
      righe: [
        '## Il Tribunale',
        'Dichiara aperta la liquidazione giudiziale della società Cantieri Brianza Demo S.r.l. e nomina il giudice delegato e il curatore.',
        '---',
        '## Crediti ammessi',
        'Contributi previdenziali scaduti: ammesso 48.000,00 euro, rango privilegiato, realizzo previsto 32%.',
        'Sanzioni civili contributive: ammesso 8.000,00 euro, rango chirografario, realizzo previsto 8%.',
        '---',
        '## Spese e tempi',
        'Spese di procedura: 18% del realizzo lordo.',
        'Durata stimata: 30 mesi.',
        '---',
        '## Avvertenza',
        'Atto dimostrativo: la variante serve a mostrare che il percorso può essere scelto anche su un’azienda non precostituita.',
      ],
    });
    pdf({
      file: 'dispositivo-cram-down-cantieri-brianza.pdf',
      titolo: 'Dispositivo di cram down — variante',
      sottotitolo: 'Tribunale di Monza — Sezione crisi d’impresa · procedura demo',
      righe: [
        '## Il Tribunale',
        'Omologa il piano di ristrutturazione e dispone il cram down nei confronti dei creditori dissenzienti.',
        '---',
        '## Crediti riconosciuti',
        'Contributi previdenziali scaduti: riconosciuto 51.000,00 euro, rango privilegiato, soddisfacimento 85%.',
        'Sanzioni civili contributive: riconosciuto 8.500,00 euro, rango chirografario, soddisfacimento 85%.',
        '---',
        '## Spese e tempi',
        'Spese di procedura: 12% del realizzo lordo.',
        'Durata stimata: 18 mesi.',
        '---',
        '## Avvertenza',
        'Dispositivo dimostrativo della variante cram down.',
      ],
    });
  }

  excel({
    file: `certificazione-debiti-${a.chiave}.xlsx`,
    titolo: 'Certificazione dei debiti',
    azienda: a.nome,
    righe: [
      ['Voce', 'Importo', 'Tipo', 'Nota'],
      [
        'Contributi previdenziali scaduti',
        a.chiave === 'meccanica-valsesia'
          ? 210000
          : a.chiave === 'tessitura-lario'
            ? 80000
            : a.chiave === 'logistica-padana'
              ? 12000
              : 60000,
        'DEBITO',
        'Dato fittizio',
      ],
      [
        'Sanzioni civili contributive',
        a.chiave === 'meccanica-valsesia'
          ? 35000
          : a.chiave === 'tessitura-lario'
            ? 12000
            : a.chiave === 'logistica-padana'
              ? 1500
              : 10000,
        'DEBITO',
        'Dato fittizio',
      ],
      [
        'Totale',
        a.chiave === 'meccanica-valsesia'
          ? 245000
          : a.chiave === 'tessitura-lario'
            ? 92000
            : a.chiave === 'logistica-padana'
              ? 13500
              : 70000,
        '',
        'Somma delle voci demo',
      ],
    ],
  });
}

// Il pacchetto unico: comodo per chi vuole vedere tutti i file senza passare
// da ogni schermata. Lo zip viene creato dallo script di shell dopo i file.
console.log(`Generati i documenti demo in ${CARTELLA}`);
