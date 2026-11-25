import { describe, expect, it } from 'vitest';
import { dettaglioDaClassificare, quotePerRango } from './classificazioneCredito';

describe('quotePerRango', () => {
  it('divide il credito per rango: contributi privilegiati, sanzioni metà e metà', () => {
    const esito = quotePerRango([
      { voce: 'Contributi', importo: 1000, stato: '', contributi: 1000, sanzioni: 0 },
      { voce: 'Sanzioni', importo: 200, stato: '', contributi: 0, sanzioni: 200 },
    ]);

    const perRango = Object.fromEntries(esito.quote.map((q) => [q.rango, q.importo]));
    expect(perRango.PRIVILEGIATO).toBe(1100);
    expect(perRango.CHIROGRAFARIO).toBe(100);
    expect(esito.escluso).toBe(0);
  });

  it('tiene fuori le quote senza rango e le dichiara', () => {
    const esito = quotePerRango([
      {
        voce: 'Cartella',
        importo: 500,
        stato: '',
        contributi: null,
        sanzioni: null,
        ambito: 'AGENTE_RISCOSSIONE',
      },
    ]);

    expect(esito.quote).toEqual([]);
    expect(esito.escluso).toBe(500);
  });
});

describe('dettaglioDaClassificare', () => {
  it('separa le cartelle dell’Agente dalle voci a cifra unica', () => {
    const d = dettaglioDaClassificare([
      {
        voce: 'Cartella',
        importo: 500,
        stato: '',
        contributi: null,
        sanzioni: null,
        ambito: 'AGENTE_RISCOSSIONE',
      },
      { voce: 'Verbale', importo: 120, stato: '', contributi: null, sanzioni: null },
    ]);

    expect(d.adr).toBe(500);
    expect(d.senzaRiparto).toBe(120);
    expect(d.totale).toBe(620);
    expect(d.possibiliDoppioni).toEqual([]);
  });

  it('segnala la stessa cifra fuori dall’Agente come possibile doppione', () => {
    const d = dettaglioDaClassificare([
      {
        voce: 'Cartella',
        importo: 500,
        stato: '',
        contributi: null,
        sanzioni: null,
        ambito: 'AGENTE_RISCOSSIONE',
      },
      { voce: 'Contributi 2019', importo: 500, stato: '', contributi: null, sanzioni: null },
    ]);

    expect(d.possibiliDoppioni).toEqual([{ voce: 'Contributi 2019', importo: 500 }]);
  });
});
