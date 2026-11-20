import { describe, it, expect } from 'vitest';
import { componiEsitoVerifica } from './esito';
import type { Attenzione } from '@/lib/screening/indicatore';
import { diagnosticaDimensioni, type DatiIai } from '@/lib/iai/dimensioni';

const minima: Attenzione = {
  esito: 'ATTENZIONE_MINIMA',
  etichetta: 'Nessuna criticità rilevata con i dati disponibili',
  fattoreDeterminante: 'Nessuna criticità emersa dai dati disponibili',
  accertato: [],
  daAccertare: [],
  dimensioniScoperte: [],
  copertura: { determinate: 4, totali: 4 },
};

const datiTranquilli: DatiIai = {
  ente: {
    soglie: [{ ambito: 'INPS', esito: 'sotto', esposizione: 0 }],
    importiNonNoti: 0,
    denunceAssenti: false,
    addetti: 5,
  },
  bilancio: {
    corrente: {
      anno: 2025,
      ricavi: 2_000_000,
      ebitda: 200_000,
      utile: 80_000,
      totaleAttivo: 1_500_000,
      attivoCircolante: 900_000,
      patrimonioNetto: 600_000,
      totaleDebiti: 800_000,
      debitiNonDisaggregati: false,
    },
    precedente: { ricavi: 1_900_000, utile: 60_000, patrimonioNetto: 520_000 },
  },
  fascicolo: { totale: 20, titoloEnte: 12, dichiarato: 8, nonNoti: 0 },
  visura: {
    disponibile: true,
    proceduraPendente: null,
    statoAttivitaAnomalo: null,
    giorniVisura: 10,
    capitaleSociale: 10_000,
  },
};

describe('esito unico della verifica', () => {
  it('il giudizio è quello del semaforo e non viene riscritto dalle dimensioni', () => {
    // Una dimensione «accesa» (procedura pendente in visura) non può cambiare
    // un esito già formato: il semaforo decide, le dimensioni spiegano.
    const accese = diagnosticaDimensioni({
      ...datiTranquilli,
      visura: { ...datiTranquilli.visura, proceduraPendente: 'liquidazione giudiziale del 2024' },
    });
    const esito = componiEsitoVerifica({ giudizio: minima, dimensioni: accese });
    expect(esito.giudizio).toBe(minima);
    expect(esito.giudizio.esito).toBe('ATTENZIONE_MINIMA');
  });

  it('non porta con sé punteggio complessivo, fasce o pesi', () => {
    const esito = componiEsitoVerifica({
      giudizio: minima,
      dimensioni: diagnosticaDimensioni(datiTranquilli),
    });
    expect(Object.keys(esito).sort()).toEqual(['determinanti', 'dimensioni', 'giudizio']);
  });

  it('i determinanti sono al massimo tre, dai più intensi, e citano la dimensione', () => {
    const accese = diagnosticaDimensioni({
      ...datiTranquilli,
      visura: {
        ...datiTranquilli.visura,
        proceduraPendente: 'concordato preventivo del 2021',
        statoAttivitaAnomalo: 'scioglimento',
      },
    });
    const esito = componiEsitoVerifica({ giudizio: minima, dimensioni: accese });
    expect(esito.determinanti.length).toBeLessThanOrEqual(3);
    expect(esito.determinanti.length).toBeGreaterThan(0);
    expect(esito.determinanti[0].etichetta).toMatch(/^[A-E] · /);
    expect(esito.determinanti[0].dimensione).toBe('E');
    const punteggi = esito.determinanti.map(
      (d) => accese.find((c) => c.dimensione === d.dimensione)!.punteggio
    );
    expect(punteggi).toEqual([...punteggi].sort((a, b) => b - a));
  });
});
