import { describe, expect, it, vi } from 'vitest';
import type jsPDF from 'jspdf';
import type { Azienda } from '@/app/actions/aziende';
import type { RigaProposta } from '@/app/actions/propostaScenario';

// Il documento viene generato davvero con jsPDF + jspdf-autotable; si
// sostituisce solo il salvataggio (che nel browser scarica il file).
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

const { generaDocumentoPropostaPdf } = await import('./pdfProposta');

describe('generaDocumentoPropostaPdf', () => {
  it('genera il PDF della proposta con le tabelle per rango', () => {
    const riga = (id: number, extra: Partial<RigaProposta>): RigaProposta => ({
      id,
      scenarioId: 1,
      categoriaCreditore: 'Fornitori',
      importoDovuto: 10000,
      percentualeOfferta: 40,
      modalita: 'UNICA_SOLUZIONE',
      numeroRate: null,
      note: null,
      rangoLegale: null,
      rilevantePerEnte: false,
      ...extra,
    });

    generaDocumentoPropostaPdf({
      azienda: {
        id: 1,
        ragioneSociale: 'Meccanica Lombarda S.r.l.',
        codiceFiscale: '01234567890',
        partitaIva: '01234567890',
        formaGiuridica: 'S.r.l.',
        capitaleSociale: 10000,
        rappresentanteLegale: 'Mario Rossi',
      } as Azienda,
      nomeScenario: 'Scenario di prova',
      righe: [
        riga(1, {}),
        riga(2, {
          categoriaCreditore: 'INPS',
          importoDovuto: 25000.5,
          percentualeOfferta: 60,
          modalita: 'RATEALE',
          numeroRate: 24,
          rangoLegale: 'CHIROGRAFARIO',
        }),
      ],
    });

    expect(salvati).toHaveLength(1);
    expect(salvati[0].nome).toBe('proposta_meccanica_lombarda_s_r_l.pdf');
    const pdf = salvati[0].doc;
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const sorgente = pdf.output();
    expect(sorgente.startsWith('%PDF-')).toBe(true);
    expect(sorgente).toContain('Proposta di accordo transattivo');
  });
});
