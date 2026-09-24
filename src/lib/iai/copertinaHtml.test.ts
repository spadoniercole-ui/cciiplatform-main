import { describe, it, expect } from 'vitest';
import { htmlCopertinaIai } from './copertinaHtml';
import { calcolaIai, type DatiIai } from './indice';

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

describe('copertina IAI in HTML', () => {
  it('contiene quadrante, barre, vincoli, sintesi, riferimenti e basi', () => {
    const h = htmlCopertinaIai(calcolaIai(dati), {
      azienda: 'DEO GRIFO S.R.L.',
      codiceFiscale: '01831130891',
      ente: 'Ricevente',
      data: '23/09/2026',
    });
    for (const atteso of [
      '<svg',
      'IAI su 100',
      'Vincolo:',
      'Determinano l’esito',
      'Riferimenti e metodo',
      'DEO GRIFO',
    ]) {
      expect(h).toContain(atteso);
    }
    expect(h).not.toContain('<script');
  });
});

describe('nota metodologica in HTML', () => {
  it('porta pesi con quota, vincoli, fasce e basi', async () => {
    const { htmlNotaMetodologica } = await import('./notaHtml');
    const { PARAMETRI_IAI_PREDEFINITI } = await import('./indice');
    const h = htmlNotaMetodologica(PARAMETRI_IAI_PREDEFINITI, false);
    for (const atteso of [
      'Pesi delle dimensioni',
      '30%',
      'Vincoli di non compensabilità',
      'Fasce',
      'Da sottoporre con urgenza',
      'Handbook',
    ])
      expect(h).toContain(atteso);
  });
});
