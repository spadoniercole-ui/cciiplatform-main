import { describe, expect, it } from 'vitest';
import type { TrattamentoVera } from '@/lib/debitiEnte/veraImport';
import {
  elencoCodiciTs,
  ripartisciRigheVera,
  sortaRigaVera,
  testiContabilizzate,
  type RigaConStatoVera,
} from './daLavorare';

const riga = (over: Partial<RigaConStatoVera> = {}): RigaConStatoVera => ({
  voce: 'Verbale Evasione',
  stato: 'Da Verificare',
  importo: 1_000,
  trattamento: 'da_contabilizzare',
  ...over,
});

const contabilizzata = (
  voce: string,
  importo: number,
  trattamento: TrattamentoVera = 'contabilizzato'
) => riga({ voce, stato: '', importo, trattamento });

describe('sortaRigaVera', () => {
  it('lo stato del V.E.R.A. decide: vuoto contabilizzato, valorizzato da lavorare', () => {
    expect(sortaRigaVera(riga({ stato: '', trattamento: 'contabilizzato' }))).toBe(
      'CONTABILIZZATA'
    );
    expect(sortaRigaVera(riga({ stato: 'Calcolati' }))).toBe('DA_LAVORARE');
    expect(sortaRigaVera(riga({ stato: 'Verificata' }))).toBe('DA_LAVORARE');
  });

  it('le TS 25, 27 e 81 contabilizzate hanno la sola decisione AdR aperta', () => {
    expect(sortaRigaVera(contabilizzata('TS 27 flusso Uniemens non versato', 3_404.02))).toBe(
      'CONTABILIZZATA_ADR'
    );
    expect(sortaRigaVera(contabilizzata('TS 25 nota di rettifica', 784.13))).toBe(
      'CONTABILIZZATA_ADR'
    );
    expect(sortaRigaVera(contabilizzata('TS 81 qualcosa', 10))).toBe('CONTABILIZZATA_ADR');
    // Un'altra natura contabilizzata non c'entra con l'AdR.
    expect(sortaRigaVera(contabilizzata('F24 Non presentato', 9_590))).toBe('CONTABILIZZATA');
  });

  it('il codice della natura non contraddice il file: una TS 27 ancora da contabilizzare si lavora', () => {
    expect(sortaRigaVera(riga({ voce: 'TS 27 flusso Uniemens non versato' }))).toBe('DA_LAVORARE');
  });

  it('la denuncia non trasmessa resta un adempimento da elencare, non un importo da contabilizzare', () => {
    // Lo stato è vuoto — per il V.E.R.A. «contabilizzato» — ma una denuncia che
    // non è partita non può essere in contabilità: lo stato dichiara che il
    // debito è iscritto (lo scrive l'F24 accanto), l'adempimento aperto è la
    // trasmissione. Resta in elenco per il suo ufficio, senza entrare fra le
    // posizioni «non ancora contabilizzate».
    expect(sortaRigaVera(contabilizzata('Denunce non trasmesse', 9_590))).toBe('ADEMPIMENTO');
    const r = ripartisciRigheVera([contabilizzata('Denunce non trasmesse', 9_590)]);
    expect(r.daLavorare.map((x) => x.voce)).toEqual(['Denunce non trasmesse']);
    expect(r.adempimenti).toEqual({ righe: 1, totale: 9_590 });
    expect(r.contabilizzate).toEqual({ righe: 0, totale: 0 });
    // L'F24 resta la faccia finanziaria: da solo è una posizione già iscritta.
    expect(sortaRigaVera(contabilizzata('F24 Non presentato', 9_590))).toBe('CONTABILIZZATA');
  });

  it('un importo ignoto è da accertare, non da dimenticare', () => {
    expect(
      sortaRigaVera(
        riga({ voce: 'Denunce non trasmesse', stato: '', importo: 0, trattamento: 'potenziale' })
      )
    ).toBe('DA_LAVORARE');
  });

  it('le sospese sono fuori perimetro: né contabilizzate né da lavorare', () => {
    expect(sortaRigaVera(riga({ stato: 'Sospeso', trattamento: 'ignora' }))).toBe(
      'FUORI_PERIMETRO'
    );
  });
});

describe('ripartisciRigheVera', () => {
  it('separa ciò che si lavora da ciò che si dichiara', () => {
    const esito = ripartisciRigheVera([
      riga({ importo: 4_959.16 }),
      riga({ voce: 'Verbale Evasione', stato: 'Verificata', importo: 5_859.87 }),
      contabilizzata('TS 27 flusso Uniemens non versato', 3_404.02),
      contabilizzata('TS 25 nota di rettifica', 784.13),
      contabilizzata('TS 27 flusso Uniemens non versato', 3_094.18),
      contabilizzata('F24 Non presentato', 9_590),
      riga({ voce: 'Cartella', stato: 'Sospeso', importo: 6_990.45, trattamento: 'ignora' }),
    ]);

    expect(esito.daLavorare).toHaveLength(2);
    expect(esito.contabilizzate).toEqual({
      righe: 4,
      totale: 3_404.02 + 784.13 + 3_094.18 + 9_590,
    });
    expect(esito.contabilizzateAdr.righe).toBe(3);
    expect(esito.codiciAdr).toEqual(['25', '27']);
    expect(esito.fuoriPerimetro).toEqual({ righe: 1, totale: 6_990.45 });
  });

  it('i codici si elencano una volta sola e in ordine numerico', () => {
    const esito = ripartisciRigheVera([
      contabilizzata('TS 81 flusso', 10),
      contabilizzata('TS 27 flusso', 20),
      contabilizzata('TS 27 flusso', 30),
      contabilizzata('TS 25 nota', 40),
    ]);
    expect(esito.codiciAdr).toEqual(['25', '27', '81']);
  });
});

describe('testiContabilizzate', () => {
  const euro = (n: number) => `${n.toFixed(2)} €`;
  const ripartizione = (contabilizzate: number, adr: number, codici: string[] = ['25', '27']) => ({
    contabilizzate: { righe: contabilizzate, totale: contabilizzate * 100 },
    contabilizzateAdr: { righe: adr, totale: adr * 100 },
    codiciAdr: codici,
  });

  it('senza posizioni già contabilizzate non dice nulla', () => {
    expect(testiContabilizzate(ripartizione(0, 0), euro)).toEqual({
      collegiale: null,
      documento: null,
    });
  });

  it('dichiara numero e importo, e a parte la quota AdR', () => {
    const testi = testiContabilizzate(ripartizione(3, 2), euro);
    expect(testi.collegiale).toContain('3 posizioni per 300.00 €');
    expect(testi.collegiale).toContain('TS 25 e 27');
    expect(testi.collegiale).toContain('2 posizioni per 200.00 €');
    expect(testi.documento).toContain('Già contabilizzate e non elencate');
    expect(testi.documento).toContain('AdR');
  });

  it('usa il singolare e non nomina l’AdR se nessuna voce la riguarda', () => {
    const testi = testiContabilizzate(ripartizione(1, 0, []), euro);
    expect(testi.collegiale).toContain('1 posizione per 100.00 €');
    expect(testi.collegiale).not.toContain('Agente della Riscossione');
    expect(testi.documento).not.toContain('AdR');
  });
});

describe('elencoCodiciTs', () => {
  it('si legge come una frase', () => {
    expect(elencoCodiciTs([])).toBe('');
    expect(elencoCodiciTs(['27'])).toBe('TS 27');
    expect(elencoCodiciTs(['25', '27'])).toBe('TS 25 e 27');
    expect(elencoCodiciTs(['25', '27', '81'])).toBe('TS 25, 27 e 81');
  });
});

describe('la sospensione da un provvedimento', () => {
  it('non si lavora e non si butta: si dichiara, e resta intestabile a un ufficio', () => {
    expect(sortaRigaVera(riga({ stato: 'Sospeso', trattamento: 'sospeso' }))).toBe('SOSPESA');

    const r = ripartisciRigheVera([
      riga({ stato: 'Sospeso', trattamento: 'sospeso', importo: 6_990.45 }),
      riga({ stato: 'Da Verificare', importo: 1_000 }),
    ]);

    expect(r.daLavorare).toHaveLength(1);
    expect(r.sospese).toEqual({ righe: 1, totale: 6_990.45 });
    expect(r.righeSospese).toHaveLength(1);
    // Non è più «fuori perimetro»: quella è la colonna da ignorare, questa ha
    // un ufficio che la riprenderà quando il provvedimento cade.
    expect(r.fuoriPerimetro).toEqual({ righe: 0, totale: 0 });
  });
});
