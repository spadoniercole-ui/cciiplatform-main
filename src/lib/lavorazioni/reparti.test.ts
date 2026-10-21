import { describe, expect, it } from 'vitest';
import type { RigaVeraComunicazione } from './comunicazioni';
import { nomeFileReparto, preparaDocumentiReparto } from './reparti';

const riga = (over: Partial<RigaVeraComunicazione> = {}): RigaVeraComunicazione => ({
  sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
  voce: 'F24 non presentato',
  importo: 12_000,
  categoria: 'CONTRIBUTI',
  stato: '',
  trattamento: 'contabilizzato',
  periodo: '202506 - 202506',
  ...over,
});

const etichette = {
  CONTRIBUTI: 'Contributi INPS',
  SANZIONI: 'Sanzioni',
  RUOLI: 'Ruoli esattoriali',
};

const base = {
  azienda: 'Alfa Srl',
  dataVerifica: '2026-10-19',
  etichette,
};

describe('preparaDocumentiReparto', () => {
  it('produce un documento per reparto con posizioni, attività e totali', () => {
    const esito = preparaDocumentiReparto({
      ...base,
      righe: [
        riga(),
        riga({ voce: 'Denunce non trasmesse', importo: 3_000, periodo: undefined }),
        riga({
          sezione: 'ADR',
          voce: 'Cartella',
          importo: 900,
          categoria: 'RUOLI',
          trattamento: 'da_contabilizzare',
        }),
      ],
      lavorazioni: [
        {
          categoria: 'CONTRIBUTI',
          lavorazione: 'Verificare e trasmettere le denunce',
          destinatario: 'Ufficio contributi',
        },
        {
          categoria: 'RUOLI',
          lavorazione: 'Verificare il ruolo e la rateizzazione',
          destinatario: 'Ufficio riscossione',
        },
      ],
    });

    expect(esito.documenti).toHaveLength(2);
    const contributi = esito.documenti.find((d) => d.reparto === 'Ufficio contributi');
    expect(contributi).toBeDefined();
    expect(contributi?.righe).toBe(2);
    expect(contributi?.totale).toBe(15_000);
    const f24 = contributi?.posizioni.find((p) => p.voce === 'F24 non presentato');
    const denunce = contributi?.posizioni.find((p) => p.voce === 'Denunce non trasmesse');
    expect(f24?.categoria).toBe('Contributi INPS');
    expect(f24?.periodo).toBe('202506 - 202506');
    expect(denunce?.periodo).toBeNull();
    expect(contributi?.attivita).toEqual([
      { lavorazione: 'Verificare e trasmettere le denunce', categorie: ['Contributi INPS'] },
    ]);
    expect(contributi?.nomeFile).toBe('comunica_reparti_alfa_srl_ufficio_contributi.pdf');
    expect(contributi?.posizioniDaContabilizzare).toBe(0);

    const riscossione = esito.documenti.find((d) => d.reparto === 'Ufficio riscossione');
    expect(riscossione?.totale).toBe(900);
    expect(riscossione?.posizioniDaContabilizzare).toBe(1);
    expect(riscossione?.importoDaContabilizzare).toBe(900);
    expect(riscossione?.posizioni[0].trattamento).toBe('Da contabilizzare');
    expect(esito.categorieSenzaLavorazione).toHaveLength(0);
    expect(esito.righeSenzaCategoria).toBe(0);
  });

  it('un reparto che segue due tipologie riceve un solo documento con due attività', () => {
    const esito = preparaDocumentiReparto({
      ...base,
      righe: [riga(), riga({ categoria: 'SANZIONI', voce: 'Sanzione', importo: 500 })],
      lavorazioni: [
        {
          categoria: 'CONTRIBUTI',
          lavorazione: 'Contabilizzare i contributi',
          destinatario: 'Ragioneria',
        },
        {
          categoria: 'SANZIONI',
          lavorazione: 'Verificare le sanzioni',
          destinatario: 'Ragioneria',
        },
      ],
    });

    expect(esito.documenti).toHaveLength(1);
    expect(esito.documenti[0].righe).toBe(2);
    expect(esito.documenti[0].totale).toBe(12_500);
    expect(esito.documenti[0].attivita.map((a) => a.lavorazione)).toEqual([
      'Contabilizzare i contributi',
      'Verificare le sanzioni',
    ]);
  });

  it('la stessa posizione su due lavorazioni dello stesso reparto compare una volta', () => {
    const esito = preparaDocumentiReparto({
      ...base,
      righe: [riga()],
      lavorazioni: [
        { categoria: 'CONTRIBUTI', lavorazione: 'Attività A', destinatario: 'Ragioneria' },
        { categoria: 'CONTRIBUTI', lavorazione: 'Attività B', destinatario: 'Ragioneria' },
      ],
    });

    expect(esito.documenti).toHaveLength(1);
    expect(esito.documenti[0].righe).toBe(1);
    expect(esito.documenti[0].totale).toBe(12_000);
    expect(esito.documenti[0].attivita).toHaveLength(2);
  });

  it('una posizione priva di categoria non finisce in nessun documento', () => {
    const esito = preparaDocumentiReparto({
      ...base,
      righe: [riga(), riga({ categoria: '' })],
      lavorazioni: [
        { categoria: 'CONTRIBUTI', lavorazione: 'Contabilizzare', destinatario: 'Ragioneria' },
      ],
    });

    expect(esito.righeSenzaCategoria).toBe(1);
    expect(esito.documenti[0].righe).toBe(1);
    expect(esito.documenti[0].totale).toBe(12_000);
  });

  it('una tipologia senza lavorazione non produce un documento muto', () => {
    const esito = preparaDocumentiReparto({
      ...base,
      righe: [riga({ categoria: 'SANZIONI', importo: 700 })],
      lavorazioni: [
        { categoria: 'CONTRIBUTI', lavorazione: 'Contabilizzare', destinatario: 'Ragioneria' },
      ],
    });

    expect(esito.documenti).toHaveLength(0);
    expect(esito.categorieSenzaLavorazione).toEqual([
      { categoria: 'SANZIONI', etichetta: 'Sanzioni', righe: 1, totale: 700 },
    ]);
  });

  it('la lavorazione spenta non genera documenti', () => {
    const esito = preparaDocumentiReparto({
      ...base,
      righe: [riga()],
      lavorazioni: [
        {
          categoria: 'CONTRIBUTI',
          lavorazione: 'Contabilizzare',
          destinatario: 'Ragioneria',
          attivo: false,
        },
      ],
    });

    expect(esito.documenti).toHaveLength(0);
  });
});

describe('nomeFileReparto', () => {
  it('toglie accenti e caratteri non utilizzabili', () => {
    expect(nomeFileReparto('Caffè & Società S.r.l.', 'Ufficio Contributi/INPS')).toBe(
      'comunica_reparti_caffe_societa_s_r_l_ufficio_contributi_inps.pdf'
    );
  });

  it('ha sempre un nome anche quando i dati sono vuoti', () => {
    expect(nomeFileReparto('', '')).toBe('comunica_reparti_azienda_reparto.pdf');
  });
});
