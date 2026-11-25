import { describe, expect, it } from 'vitest';
import { VOCE_DEBITO_ACCERTATO, vociEnteDaFonti } from './posizioneEnte';

const vuoto = { azienda: [], scenario: [], certificazione: [], memorizzato: null };

describe('voci della posizione dell’ente per il confronto con il provvedimento', () => {
  it('usa le posizioni dell’azienda quando ci sono', () => {
    expect(
      vociEnteDaFonti({
        ...vuoto,
        azienda: [{ voce: 'Contributi', importo: 1200 }],
        certificazione: [{ voce: 'Sanzioni', importo: 300 }],
        memorizzato: 1500,
      })
    ).toEqual([{ voce: 'Contributi', importo: 1200 }]);
  });

  it('se le posizioni dell’azienda mancano legge la certificazione: il debito è già accertato', () => {
    expect(
      vociEnteDaFonti({
        ...vuoto,
        certificazione: [{ voce: 'Sanzioni', importo: 300 }],
        memorizzato: 300,
      })
    ).toEqual([{ voce: 'Sanzioni', importo: 300 }]);
  });

  it('le righe di uno scenario vecchio valgono solo se le posizioni dell’azienda sono vuote', () => {
    expect(
      vociEnteDaFonti({
        ...vuoto,
        scenario: [{ voce: 'Contributi pregressi', importo: 800 }],
        certificazione: [{ voce: 'Sanzioni', importo: 300 }],
      })
    ).toEqual([{ voce: 'Contributi pregressi', importo: 800 }]);
  });

  it('senza righe resta la cifra conclusa dalla verifica, dichiarata come tale', () => {
    expect(vociEnteDaFonti({ ...vuoto, memorizzato: 24_000 })).toEqual([
      { voce: VOCE_DEBITO_ACCERTATO, importo: 24_000 },
    ]);
  });

  it('scarta gli importi nulli o non finiti e senza nulla la posizione è assente', () => {
    expect(
      vociEnteDaFonti({
        azienda: [{ voce: 'Zero', importo: 0 }],
        scenario: [{ voce: 'Non finito', importo: Number.NaN }],
        certificazione: [],
        memorizzato: 0,
      })
    ).toEqual([]);
  });
});
