import { describe, it, expect } from 'vitest';
import { htmlCopertinaEsito } from './esitoHtml';
import { componiEsitoVerifica } from '@/lib/verifica/esito';
import { diagnosticaDimensioni, type DatiIai } from './dimensioni';
import type { Attenzione } from '@/lib/screening/indicatore';

const attenzione: Attenzione = {
  esito: 'ROSSO',
  etichetta: 'Criticità rilevante',
  fattoreDeterminante: 'Soglia di segnalazione superata',
  accertato: ['Presupposti dell’art. 25-novies rilevati (INPS).'],
  daAccertare: ['Ritardo di oltre 90 giorni: serve l’Elenco Deleghe.'],
  dimensioniScoperte: [],
  copertura: { determinate: 4, totali: 4 },
};

const dati: DatiIai = {
  ente: {
    soglie: [{ ambito: 'INPS', esito: 'sopra', esposizione: 19_621 }],
    importiNonNoti: 4,
    denunceAssenti: null,
    addetti: 7,
  },
  bilancio: {
    corrente: {
      anno: 2025,
      ricavi: 1_016_000,
      ebitda: -6_683,
      utile: -5_956,
      totaleAttivo: 1_680_673,
      attivoCircolante: 1_549_158,
      patrimonioNetto: -504_146,
      totaleDebiti: 2_029_450,
      debitiNonDisaggregati: true,
    },
    precedente: { ricavi: 1_425_326, utile: 34_677, patrimonioNetto: -498_191 },
  },
  fascicolo: { totale: 111, titoloEnte: 16, dichiarato: 90, nonNoti: 4 },
  visura: {
    disponibile: true,
    proceduraPendente: 'concordato preventivo del 05/02/2021',
    statoAttivitaAnomalo: null,
    giorniVisura: 2,
    capitaleSociale: 3_000,
  },
};

describe('prima pagina del documento: l’esito', () => {
  it('porta giudizio, accertato, da accertare, copertura e dimensioni', () => {
    const h = htmlCopertinaEsito(
      componiEsitoVerifica({ giudizio: attenzione, dimensioni: diagnosticaDimensioni(dati) }),
      {
        azienda: 'DEO GRIFO S.R.L.',
        codiceFiscale: '01831130891',
        ente: 'Ricevente',
        data: '23/09/2026',
      }
    );
    for (const atteso of [
      'DEO GRIFO',
      'Criticità rilevante',
      'Soglia di segnalazione superata',
      'Accertato',
      'Da accertare',
      'Copertura informativa: 4 dimensioni su 4',
      'Dove si concentra l’attenzione',
      'Quadro procedurale',
    ]) {
      expect(h).toContain(atteso);
    }
    expect(h).not.toContain('<script');
    // Il vecchio indice non deve rientrare dalla stampa.
    expect(h).not.toContain('IAI su 100');
    expect(h).not.toMatch(/fascia/i);
  });
});
