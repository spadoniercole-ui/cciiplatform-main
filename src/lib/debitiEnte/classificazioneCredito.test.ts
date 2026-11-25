import { describe, expect, it } from 'vitest';
import {
  classificaRiga,
  rigaCerta,
  totaliClassificazione,
  type RigaDaClassificare,
} from './classificazioneCredito';

const riga = (r: Partial<RigaDaClassificare>): RigaDaClassificare => ({
  voce: 'TS 27 flusso Uniemens non versato',
  importo: 0,
  stato: '',
  contributi: null,
  sanzioni: null,
  ambito: 'INPS',
  ...r,
});

describe('classificazione del credito dell’ente', () => {
  it('i contributi stanno nel privilegio di I grado', () => {
    expect(
      classificaRiga(riga({ importo: 3404.02, contributi: 3041, sanzioni: 363.02 })).quote
    ).toEqual([
      { classe: 'CONTRIBUTI', grado: 'I', importo: 3041 },
      { classe: 'SANZIONI_CIVILI', grado: 'VIII', importo: 181.51 },
      { classe: 'SANZIONI_CIVILI', grado: 'CHIROGRAFO', importo: 181.51 },
    ]);
  });

  it('le sanzioni civili si dividono a metà, con il resto al chirografo', () => {
    const q = classificaRiga(riga({ importo: 0.01, contributi: 0, sanzioni: 0.01 })).quote;
    expect(q).toEqual([
      { classe: 'SANZIONI_CIVILI', grado: 'VIII', importo: 0.01 },
      // 0,01 × 50% = 0,005 → 0,01 privilegiato e 0 chirografo: il privilegio
      // non si arrotonda in su, quindi qui resta la sola quota privilegiata.
    ]);
    const due = classificaRiga(riga({ importo: 0.03, contributi: 0, sanzioni: 0.03 })).quote;
    expect(due).toEqual([
      { classe: 'SANZIONI_CIVILI', grado: 'VIII', importo: 0.02 },
      { classe: 'SANZIONI_CIVILI', grado: 'CHIROGRAFO', importo: 0.01 },
    ]);
  });

  it('verbali e note con una cifra unica restano da classificare', () => {
    const q = classificaRiga(
      riga({ voce: 'Verbale Evasione', importo: 4959.16, stato: 'Calcolati' })
    ).quote;
    expect(q).toEqual([{ classe: 'DA_CLASSIFICARE', grado: 'CHIROGRAFO', importo: 4959.16 }]);
  });

  it('le cartelle dell’Agente della Riscossione non si classificano da un residuo', () => {
    const q = classificaRiga(riga({ importo: 1230.6, ambito: 'AGENTE_RISCOSSIONE' })).quote;
    expect(q).toEqual([{ classe: 'DA_CLASSIFICARE', grado: 'CHIROGRAFO', importo: 1230.6 }]);
  });

  it('le note non definite e le posizioni sospese non sono debito certo', () => {
    expect(rigaCerta({ voce: 'Note di rettifica non definite', stato: '' })).toBe(false);
    expect(rigaCerta({ voce: 'TS 25 nota di rettifica', stato: 'Da Verificare' })).toBe(false);
    expect(rigaCerta({ voce: 'Cartella', stato: 'Sospeso' })).toBe(false);
    expect(rigaCerta({ voce: 'Verbale Evasione', stato: 'Verificata' })).toBe(true);
    expect(rigaCerta({ voce: 'TS 27 flusso Uniemens non versato', stato: '' })).toBe(true);
    const q = classificaRiga(riga({ voce: 'Note di rettifica non definite', importo: 565.38 }));
    expect(q).toEqual({
      certo: false,
      quote: [{ classe: 'NON_DETERMINATO', grado: 'CHIROGRAFO', importo: 565.38 }],
    });
  });

  it('i flussi di regolarizzazione negativi sono crediti a favore dell’azienda', () => {
    expect(classificaRiga(riga({ importo: -191.47 })).quote).toEqual([
      { classe: 'CREDITO_A_FAVORE', grado: 'CHIROGRAFO', importo: 191.47 },
    ]);
  });

  it('il resto non attribuibile non si regala a una classe', () => {
    const q = classificaRiga(riga({ importo: 100, contributi: 60, sanzioni: 20 })).quote;
    expect(q).toContainEqual({ classe: 'DA_CLASSIFICARE', grado: 'CHIROGRAFO', importo: 20 });
  });

  it('i totali sommano le classi del file reale e tengono fuori il non certo', () => {
    const t = totaliClassificazione([
      riga({ importo: 3404.02, contributi: 3041, sanzioni: 363.02, stato: '' }),
      riga({ voce: 'Note di rettifica non definite', importo: 565.38 }),
      riga({ voce: 'Flusso di regolarizzazione', importo: -191.47 }),
      riga({ voce: 'Verbale Evasione', importo: 4959.16, stato: 'Calcolati' }),
    ]);
    expect(t.contributi).toBe(3041);
    expect(t.sanzioniPrivilegiate).toBe(181.51);
    expect(t.sanzioniChirografo).toBe(181.51);
    expect(t.nonDeterminato).toBe(565.38);
    expect(t.creditoAFavore).toBe(191.47);
    expect(t.daClassificare).toBe(4959.16);
    expect(t.certo).toBe(3041 + 181.51 + 181.51 + 4959.16);
  });
});
