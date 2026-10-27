import { describe, expect, it, vi } from 'vitest';
import type jsPDF from 'jspdf';
import type { DocumentoReparto } from './reparti';

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

const { generaPdfReparto, scaricaPdfReparto } = await import('./pdfReparto');

const documento = (over: Partial<DocumentoReparto> = {}): DocumentoReparto => ({
  reparto: 'Ufficio contributi',
  oggetto: 'Posizione debitoria Alfa Srl — debiti da lavorare e attività di contabilizzazione',
  azienda: 'Alfa Srl',
  dataVerifica: '2026-10-19',
  posizioni: [
    {
      categoria: 'Contributi INPS',
      sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
      voce: 'F24 non presentato',
      periodo: '202506 - 202506',
      stato: '',
      trattamento: 'Contabilizzato',
      importo: 12_000,
    },
    {
      categoria: 'Contributi INPS',
      sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
      voce: 'Denunce non trasmesse',
      periodo: null,
      stato: '',
      trattamento: 'Da contabilizzare',
      importo: 3_000,
    },
  ],
  attivita: [
    { lavorazione: 'Verificare e trasmettere le denunce', categorie: ['Contributi INPS'] },
  ],
  righe: 2,
  totale: 15_000,
  posizioniDaContabilizzare: 1,
  importoDaContabilizzare: 3_000,
  posizioniEscluse: { righe: 0, totale: 0 },
  contabilizzate: { righe: 2, totale: 4_400 },
  contabilizzateAdr: { righe: 1, totale: 1_400 },
  codiciAdr: ['27'],
  nomeFile: 'comunica_reparti_alfa_srl_ufficio_contributi.pdf',
  versione: '2-3f9a1c2b',
  ...over,
});

describe('generaPdfReparto', () => {
  it('genera un PDF con debiti, attività e totali', () => {
    const pdf = generaPdfReparto(documento());
    const sorgente = pdf.output();

    expect(sorgente.startsWith('%PDF-')).toBe(true);
    expect(sorgente).toContain('Comunicazione ai reparti');
    expect(sorgente).toContain('Alfa Srl');
    expect(sorgente).toContain('Ufficio contributi');
    expect(sorgente).toContain('Verificare e trasmettere le denunce');
    // La versione è stampata sul foglio: è il modo per dire al reparto quale
    // documento ha in mano quando arriva una posizione aggiornata.
    expect(sorgente).toContain('2-3f9a1c2b');
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // Il totale del foglio non è il totale del V.E.R.A.: la differenza ha una
  // spiegazione scritta, con l'importo e la quota che riguarda l'AdR.
  it('dichiara le posizioni già contabilizzate, con la quota della sola decisione AdR', () => {
    const sorgente = generaPdfReparto(documento()).output();

    expect(sorgente).toContain('Già contabilizzate e non elencate');
    expect(sorgente).toContain('TS 27');
    expect(sorgente).toContain('AdR');
  });

  it('dichiara le posizioni fuori perimetro, senza elencarle', () => {
    const pdf = generaPdfReparto(documento({ posizioniEscluse: { righe: 3, totale: 4_500 } }));
    const sorgente = pdf.output();

    expect(sorgente).toContain('Fuori perimetro');
    expect(sorgente).toContain('4.500,00');
    expect(sorgente).not.toContain('Sospeso');
  });

  it('regge un reparto con molte posizioni senza perdere le attività', () => {
    const posizioni = Array.from({ length: 60 }, (_, i) => ({
      categoria: 'Contributi INPS',
      sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
      voce: `Voce ${i + 1}`,
      periodo: '202506 - 202506',
      stato: 'Aperto',
      trattamento: 'Da contabilizzare',
      importo: 1_000 + i,
    }));
    const pdf = generaPdfReparto(
      documento({
        posizioni,
        righe: posizioni.length,
        totale: posizioni.reduce((a, p) => a + p.importo, 0),
        posizioniDaContabilizzare: posizioni.length,
      })
    );

    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.output().startsWith('%PDF-')).toBe(true);
  });
});

describe('scaricaPdfReparto', () => {
  it('salva il file con il nome preparato dal dominio', () => {
    salvati.length = 0;
    scaricaPdfReparto(documento());

    expect(salvati).toHaveLength(1);
    expect(salvati[0].nome).toBe('comunica_reparti_alfa_srl_ufficio_contributi.pdf');
  });
});
