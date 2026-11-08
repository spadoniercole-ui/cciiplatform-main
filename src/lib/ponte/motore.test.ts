import { describe, expect, it } from 'vitest';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import { calcolaPonte, ErrorePonte } from './motore';
import type { InputPonte } from './types';

function dati(over: Partial<DatiFinanziariPeriodo> = {}): DatiFinanziariPeriodo {
  return {
    ricaviVendite: 1_200_000,
    valoreProduzione: 1_250_000,
    costiProduzione: 1_100_000,
    ebit: 150_000,
    ammortamenti: 50_000,
    ebitda: 200_000,
    oneriFinanziari: 20_000,
    utileEsercizio: 60_000,
    totaleAttivo: 900_000,
    attivoCircolante: 500_000,
    disponibilitaLiquide: 100_000,
    immobilizzazioni: 400_000,
    patrimonioNetto: 300_000,
    totaleDebiti: 600_000,
    debitiBanche: 200_000,
    debitiFornitori: 150_000,
    debitiTributari: 60_000,
    debitiPrevidenziali: 40_000,
    passivoCorrente: 350_000,
    creditiClienti: 200_000,
    ...over,
  };
}

function input(over: Partial<InputPonte> = {}): InputPonte {
  return {
    aziendaId: 1,
    dataRiferimento: '2025-06-30',
    esercizi: [
      { anno: 2023, dati: dati({ ricaviVendite: 1_000_000, valoreProduzione: 1_050_000 }) },
      { anno: 2024, dati: dati() },
    ],
    debitoEnte: {
      totale: 150_000,
      contributi: 100_000,
      sanzioni: 10_000,
      creditiAgente: 40_000,
      righe: 12,
      fonte: 'certificazione dei debiti',
    },
    debitoEnteDichiaratoZero: false,
    note: [
      {
        tagPulito: 'notaintegrativa',
        tagOriginale: 'itcc-ci:NotaIntegrativa',
        contextRef: '',
        testo: 'La società ha valutato le immobilizzazioni al costo storico.',
        lingua: 'it',
        ordine: 0,
      },
      {
        tagPulito: 'notacrediti',
        tagOriginale: 'itcc-ci:NotaCrediti',
        contextRef: '',
        testo: 'I crediti sono esposti al netto del fondo svalutazione.',
        lingua: 'it',
        ordine: 1,
      },
    ],
    visura: null,
    visuraImpronta: null,
    settore: {
      tasso: 3,
      fonte: 'settore',
      descrizione: 'Crescita del settore dal 2020 al 2024: 3%.',
    },
    ...over,
  };
}

function codiceErrore(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof ErrorePonte ? e.codice : (e as Error).message;
  }
}

describe('calcolaPonte', () => {
  it('proietta i mesi dalla chiusura del bilancio alla Data verifica', () => {
    const esito = calcolaPonte(input());
    expect(esito.mesi).toHaveLength(6);
    expect(esito.mesi[0].mese).toBe('2025-01');
    expect(esito.mesi[5].mese).toBe('2025-06');
    expect(esito.anni).toHaveLength(1);
    expect(esito.anni[0].mesi).toBe(6);
    expect(esito.esercizioPartenza).toBe(2024);
    expect(esito.versioneMotore).toBe('ponte-1.0.0');
  });

  it('riconcilia il patrimonio netto con l’utile prodotto', () => {
    const esito = calcolaPonte(input());
    expect(esito.riconciliazione.patrimonioNettoBilancio).toBe(300_000);
    expect(esito.riconciliazione.patrimonioNettoPonte).toBeCloseTo(
      esito.riconciliazione.patrimonioNettoBilancio + esito.riconciliazione.utilePonte,
      2
    );
  });

  it('rettifica il debito ente una volta sola, con una voce esplicita', () => {
    const esito = calcolaPonte(input());
    // Debito ente 150.000, quota storica tributaria + previdenziale 100.000:
    // la rettifica è +50.000 e il debito finale la contiene una volta.
    expect(esito.riconciliazione.debitoEnteCerto).toBe(150_000);
    expect(esito.riconciliazione.debitoEnteNelBilancio).toBe(100_000);
    expect(esito.riconciliazione.rettificaDebitoEnte).toBe(50_000);
    expect(esito.mesi.at(-1)?.rettificaDebitoEnte).toBe(50_000);
    expect(esito.mesi.at(-1)?.totaleDebiti).toBeCloseTo(
      Number(esito.mesi.at(-1)?.debitiBanche) +
        Number(esito.mesi.at(-1)?.debitiFornitori) +
        Number(esito.mesi.at(-1)?.debitiTributari) +
        Number(esito.mesi.at(-1)?.debitiPrevidenziali) +
        Number(esito.mesi.at(-1)?.altriDebiti) +
        50_000,
      2
    );
  });

  it('non crea debito quando la cassa è negativa: registra il fabbisogno', () => {
    const esito = calcolaPonte(
      input({
        esercizi: [
          {
            anno: 2024,
            dati: dati({
              disponibilitaLiquide: 10_000,
              ricaviVendite: 800_000,
              valoreProduzione: 800_000,
              costiProduzione: 900_000,
              creditiClienti: 300_000,
              debitiFornitori: 50_000,
            }),
          },
        ],
      })
    );
    expect(esito.cassaMinima).toBeLessThan(0);
    expect(esito.fabbisognoSenzaFinanziamento).toBeGreaterThan(0);
    expect(esito.mesi.at(-1)?.fabbisognoSenzaFinanziamento).toBeCloseTo(
      Math.max(0, -Number(esito.cassaMinima)),
      2
    );
    // Il debito non è stato aumentato per chiudere la cassa: resta la somma
    // delle voci, con la sola rettifica del debito ente.
    expect(esito.mesi.at(-1)?.totaleDebiti).toBeGreaterThan(0);
  });

  it('produce uno scenario favorevole e uno sfavorevole senza probabilità', () => {
    const esito = calcolaPonte(input());
    expect(esito.scenari.favorevole.utileTotale).toBeGreaterThan(esito.utileTotale);
    expect(esito.scenari.sfavorevole.utileTotale).toBeLessThan(esito.utileTotale);
    expect(esito.scenari.favorevole.cassaFinale).toBeGreaterThan(esito.cassaFinale);
    expect(esito.scenari.sfavorevole.cassaFinale).toBeLessThan(esito.cassaFinale);
  });

  it('blocca il Ponte quando il bilancio arriva già alla Data verifica', () => {
    expect(codiceErrore(() => calcolaPonte(input({ dataRiferimento: '2024-12-31' })))).toBe(
      'PONTE_NON_NECESSARIO'
    );
  });

  it('blocca un orizzonte oltre 60 mesi', () => {
    expect(codiceErrore(() => calcolaPonte(input({ dataRiferimento: '2030-01-31' })))).toBe(
      'GAP_TROPPO_LUNGO'
    );
  });

  it('rifiuta un’assunzione fuori dall’intervallo ammesso', () => {
    expect(
      codiceErrore(() =>
        calcolaPonte(
          input({
            assunzioni: [
              {
                codice: 'crescitaRicavi',
                etichetta: 'Crescita annua dei ricavi',
                valore: 45,
                unita: '%',
                fonte: 'stimata',
                motivazione: 'Prova fuori scala.',
                intervallo: [-20, 20],
              },
            ],
          })
        )
      )
    ).toBe('ASSUNZIONE_FUORI_INTERVALLO');
  });

  it('dichiara la copertura e i limiti, senza spacciarli per probabilità', () => {
    const esito = calcolaPonte(input());
    expect(esito.copertura.punteggio).toBeGreaterThan(0.7);
    expect(['ALTA', 'MEDIA']).toContain(esito.copertura.livello);
    expect(esito.limiti.length).toBeGreaterThan(3);
    expect(esito.avvisi.some((a) => a.codice === 'VISURA_ASSENTE')).toBe(true);
    expect(esito.sintesi).toContain('non qualifica la crisi');
  });
});
