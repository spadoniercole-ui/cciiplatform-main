import { describe, it, expect } from 'vitest';
import {
  componiFascicolo,
  estraiImportiDaTesto,
  riconciliaTestoConFascicolo,
  riepilogoFascicolo,
  IMPORTI_DI_LEGGE,
} from './evidenza';

const FASCICOLO = componiFascicolo({
  proposta: [
    {
      id: 1,
      categoriaCreditore: 'INPS',
      importoDovuto: 120_000,
      percentualeOfferta: 40,
      rangoLegale: 'PRIVILEGIO_GENERALE',
      documento: null,
    },
    {
      id: 2,
      categoriaCreditore: 'Fornitori',
      importoDovuto: 250_000,
      percentualeOfferta: 20,
      rangoLegale: 'CHIROGRAFARIO',
      documento: { nomeFile: 'proposta.xlsx', impronta: 'b'.repeat(64) },
    },
  ],
  posizioneEnte: [
    {
      id: 7,
      voce: 'Contributi 2025',
      importo: 90_000,
      importoVersato: 10_000,
      tipo: 'CLE',
      data: '2025-12-31',
      documento: { nomeFile: 'inadempienze.xlsx', impronta: 'a'.repeat(64) },
    },
  ],
  vera: [
    {
      id: 3,
      sezione: 'Crediti',
      voce: 'DM10 insoluti',
      importo: 14_914.41,
      categoria: 'Contributi',
      trattamento: 'contabilizzato',
      documento: null,
    },
    {
      id: 4,
      sezione: 'Crediti',
      voce: 'Note di rettifica',
      importo: 0,
      categoria: 'Contributi',
      trattamento: 'potenziale',
      documento: null,
    },
    {
      id: 5,
      sezione: 'Altro',
      voce: 'Voce esclusa',
      importo: 999,
      categoria: 'Altro',
      trattamento: 'ignora',
      documento: null,
    },
  ],
});

describe('fascicolo di evidenza', () => {
  it('ogni riga diventa un’evidenza con identificativo stabile', () => {
    expect(FASCICOLO.find((e) => e.id === 'EV-PRO-1-dovuto')?.importo).toBe(120_000);
    expect(FASCICOLO.find((e) => e.id === 'EV-ENT-7')?.dataRiferimento).toBe('2025-12-31');
    expect(new Set(FASCICOLO.map((e) => e.id)).size).toBe(FASCICOLO.length);
  });

  it('una voce a importo non noto NON vale zero', () => {
    const potenziale = FASCICOLO.find((e) => e.id === 'EV-VER-4')!;
    expect(potenziale.importo).toBeNull();
    expect(potenziale.stato).toBe('IMPORTO_NON_NOTO');
    expect(FASCICOLO.some((e) => e.id === 'EV-VER-5')).toBe(false);
  });

  it('i valori calcolati dichiarano da che cosa derivano', () => {
    const offerto = FASCICOLO.find((e) => e.id === 'EV-PRO-1-offerto')!;
    expect(offerto.importo).toBe(48_000);
    expect(offerto.stato).toBe('DERIVATO');
    expect(offerto.derivatoDa?.ids).toEqual(['EV-PRO-1-dovuto']);
    expect(FASCICOLO.find((e) => e.id === 'EV-ENT-7-saldo')?.importo).toBe(80_000);
    expect(FASCICOLO.find((e) => e.id === 'EV-CAL-proposta-totale-dovuto')?.importo).toBe(370_000);
  });

  it('il criterio è il titolo: partite dell’ente «titolo dell’ente», dati aziendali «dichiarato»', () => {
    const r = riepilogoFascicolo(FASCICOLO);
    expect(r.TITOLO_ENTE).toBe(2);
    expect(r.DICHIARATO).toBe(2);
    expect(FASCICOLO.find((e) => e.id === 'EV-ENT-7')?.documento?.nome).toBe('inadempienze.xlsx');
    expect(r.IMPORTO_NON_NOTO).toBe(1);
    expect(r.DERIVATO).toBeGreaterThan(0);
  });
});

describe('bilancio nel fascicolo', () => {
  it('ogni voce di bilancio è un’evidenza per anno; con il file XBRL registrato è documentata', () => {
    const f = componiFascicolo({
      proposta: [],
      posizioneEnte: [],
      vera: [],
      bilanci: [
        {
          id: 1,
          anno: 2025,
          comparativo: false,
          documento: { nomeFile: 'bilancio2025.xbrl', impronta: 'c'.repeat(64) },
          voci: { patrimonioNetto: -504_146, totaleAttivo: 1_200_000, debitiPrevidenziali: 30_000 },
        },
      ],
    });
    const pn = f.find((e) => e.id === 'EV-BIL-2025-patrimonioNetto')!;
    expect(pn.importo).toBe(-504_146);
    expect(pn.stato).toBe('DICHIARATO');
    expect(pn.dataRiferimento).toBe('2025-12-31');
    expect(f.find((e) => e.id === 'EV-BIL-2025-debitiPrevidenziali')!.descrizione).toContain(
      'non si usa per le soglie'
    );
    // la riconciliazione confronta valori assoluti: «€ 504.146» nel testo trova il PN negativo
    expect(
      riconciliaTestoConFascicolo('patrimonio netto di € 504.146', f).riconciliati
    ).toHaveLength(1);
  });
});

describe('riconciliazione di un testo con il fascicolo', () => {
  it('legge gli importi scritti all’italiana', () => {
    expect(
      estraiImportiDaTesto('pari a € 14.914,41 e a 120.000 euro, oltre a euro 48000').map(
        (i) => i.valore
      )
    ).toEqual([14914.41, 120000, 48000]);
  });

  it('un importo del testo deve avere la sua evidenza; le soglie di legge non sono dati', () => {
    const testo =
      'L’INPS vanta € 120.000, l’offerta è di 48.000 euro. Il V.E.R.A. espone € 14.914 contro la soglia di € 15.000. Il debito bancario è di € 777.000.';
    const r = riconciliaTestoConFascicolo(testo, FASCICOLO, IMPORTI_DI_LEGGE);
    expect(r.riconciliati.map((x) => x.evidenza.id)).toEqual([
      'EV-PRO-1-dovuto',
      'EV-PRO-1-offerto',
      'EV-VER-3',
    ]);
    expect(r.nonRiconciliati.map((x) => x.valore)).toEqual([777_000]);
  });
});
