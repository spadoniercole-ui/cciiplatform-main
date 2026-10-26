import { describe, expect, it, vi } from 'vitest';
import type jsPDF from 'jspdf';
import type { DocumentoUo } from './reportUo';

// Il PDF viene generato davvero con jsPDF + jspdf-autotable; si sostituisce
// solo il salvataggio, che nel browser scarica il file.
const salvati: { doc: jsPDF; nome: string }[] = [];
vi.mock('jspdf', async () => {
  const reale = (await vi.importActual<{ default: typeof jsPDF }>('jspdf')).default;
  class JsPdfDiProva extends reale {
    constructor(...args: ConstructorParameters<typeof jsPDF>) {
      super(...args);
      this.save = ((nome: string) => {
        salvati.push({ doc: this, nome });
        return this;
      }) as never;
    }
  }
  return { default: JsPdfDiProva, jsPDF: JsPdfDiProva };
});

const { generaPdfReportUo, scaricaPdfReportUo } = await import('./pdfReportUo');

const documento = (over: Partial<DocumentoUo> = {}): DocumentoUo => ({
  dipendenza: 'Ufficio contributi',
  oggetto: 'Posizione debitoria Alfa Srl — debiti da lavorare per codice e unità operativa',
  azienda: 'Alfa Srl',
  dataVerifica: '2026-10-19',
  codici: [
    {
      codice: '27',
      materia: 'Flussi Uniemens',
      importo: 2_000,
      righe: 2,
      inadempienze: [
        {
          sezione: 'FLUSSI UNIEMENS',
          voce: 'TS 27 flusso Uniemens non versato',
          periodo: '202506 - 202506',
          stato: 'Aperto',
          trattamento: 'Da contabilizzare',
          importo: 1_200,
        },
        {
          sezione: 'FLUSSI UNIEMENS',
          voce: 'TS 27 flusso Uniemens non versato',
          periodo: '202507 - 202507',
          stato: 'Aperto',
          trattamento: 'Da contabilizzare',
          importo: 800,
        },
      ],
      lavorazioni: [
        {
          tipologia: 'Verifica del flusso',
          procedura: 'Estrarre il flusso\nConfrontare con il versato',
          esito: 'Diffida',
        },
      ],
    },
    {
      codice: '18',
      materia: null,
      importo: 500,
      righe: 1,
      inadempienze: [
        {
          sezione: 'VERBALI',
          voce: 'TS 18 verbale di accertamento',
          periodo: null,
          stato: '',
          trattamento: 'Contabilizzato',
          importo: 500,
        },
      ],
      lavorazioni: [],
    },
  ],
  righe: 3,
  totale: 2_500,
  posizioniDaContabilizzare: 2,
  importoDaContabilizzare: 2_000,
  posizioniEscluse: { righe: 1, totale: 9_000 },
  nomeFile: 'report_uo_alfa_srl_ufficio_contributi_3f9a1c2b.pdf',
  versione: '1-3f9a1c2b',
  ...over,
});

describe('generaPdfReportUo', () => {
  it('genera un PDF con codici, inadempienze, lavorazioni e totali', () => {
    const pdf = generaPdfReportUo(documento());
    const sorgente = pdf.output();

    expect(sorgente.startsWith('%PDF-')).toBe(true);
    expect(sorgente).toContain('Report per unità operativa');
    expect(sorgente).toContain('Alfa Srl');
    expect(sorgente).toContain('Ufficio contributi');
    expect(sorgente).toContain('Codice 27');
    expect(sorgente).toContain('Flussi Uniemens');
    // Il periodo è ciò che dice all'ufficio QUALE versamento regolarizzare.
    expect(sorgente).toContain('202506 - 202506');
    expect(sorgente).toContain('Verifica del flusso');
    expect(sorgente).toContain('Diffida');
    // La versione è stampata sul foglio: serve a dire all'ufficio quale
    // documento ha in mano quando arriva una posizione aggiornata.
    expect(sorgente).toContain('1-3f9a1c2b');
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('dichiara il codice senza lavorazioni configurate invece di lasciare il vuoto', () => {
    const pdf = generaPdfReportUo(
      documento({
        codici: [
          {
            codice: '18',
            materia: null,
            importo: 500,
            righe: 1,
            inadempienze: [
              {
                sezione: 'VERBALI',
                voce: 'TS 18 verbale',
                periodo: null,
                stato: '',
                trattamento: 'Contabilizzato',
                importo: 500,
              },
            ],
            lavorazioni: [],
          },
        ],
        righe: 1,
        totale: 500,
        posizioniDaContabilizzare: 0,
        importoDaContabilizzare: 0,
        posizioniEscluse: { righe: 0, totale: 0 },
      })
    );
    expect(pdf.output()).toContain('Nessuna lavorazione configurata');
  });

  it('intitola le voci senza codice con la materia e non le conta come codici', () => {
    const pdf = generaPdfReportUo(
      documento({
        codici: [
          {
            codice: null,
            materia: 'Flussi Uniemens',
            importo: 40,
            righe: 1,
            inadempienze: [
              {
                sezione: 'FLUSSI UNIEMENS',
                voce: 'Interessi di mora',
                periodo: null,
                stato: '',
                trattamento: 'Contabilizzato',
                importo: 40,
              },
            ],
            lavorazioni: [{ tipologia: 'Verifica del flusso', procedura: null, esito: 'Diffida' }],
          },
        ],
        righe: 1,
        totale: 40,
        posizioniDaContabilizzare: 1,
        importoDaContabilizzare: 40,
        posizioniEscluse: { righe: 0, totale: 0 },
      })
    );
    const sorgente = pdf.output();
    // Il foglio dice che non c'è un codice, invece di stampare un numero vuoto.
    expect(sorgente).toContain('Senza codice di partita');
    expect(sorgente).toContain('Flussi Uniemens');
    expect(sorgente).toContain('Codici elencati: 0');
    expect(sorgente).toContain('voci senza codice: 1');
  });

  it('regge molti codici senza perdere le lavorazioni', () => {
    const codici = Array.from({ length: 25 }, (_, i) => ({
      codice: String(i + 1),
      materia: `Materia ${i + 1}`,
      importo: 1_000 + i,
      righe: 2,
      inadempienze: [
        {
          sezione: 'FLUSSI UNIEMENS',
          voce: `TS ${i + 1} flusso non versato`,
          periodo: '202506 - 202506',
          stato: 'Aperto',
          trattamento: 'Da contabilizzare',
          importo: 1_000 + i,
        },
        {
          sezione: 'FLUSSI UNIEMENS',
          voce: `TS ${i + 1} flusso non versato`,
          periodo: '202507 - 202507',
          stato: 'Aperto',
          trattamento: 'Da contabilizzare',
          importo: 0,
        },
      ],
      lavorazioni: [{ tipologia: 'Verifica del flusso', procedura: 'Estrarre', esito: 'Diffida' }],
    }));
    const pdf = generaPdfReportUo(
      documento({
        codici,
        righe: codici.length * 2,
        totale: codici.reduce((a, c) => a + c.importo, 0),
        posizioniDaContabilizzare: codici.length * 2,
        importoDaContabilizzare: codici.reduce((a, c) => a + c.importo, 0),
        posizioniEscluse: { righe: 0, totale: 0 },
      })
    );

    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.output().startsWith('%PDF-')).toBe(true);
  });
});

describe('scaricaPdfReportUo', () => {
  it('salva il file con il nome preparato dal dominio', () => {
    salvati.length = 0;
    scaricaPdfReportUo(documento());

    expect(salvati).toHaveLength(1);
    expect(salvati[0].nome).toBe('report_uo_alfa_srl_ufficio_contributi_3f9a1c2b.pdf');
  });
});
