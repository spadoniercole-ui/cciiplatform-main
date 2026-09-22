import { describe, it, expect } from 'vitest';
import { estraiCitazioni, riscontraCitazioni, chiaviFonte } from './citazioni';
import { FONTI } from './fonti';

describe('citazioni normative nel testo', () => {
  it('una citazione doppia della stessa fonte produce un solo rilievo', () => {
    expect(
      riscontraCitazioni('Rilevano gli artt. 2482-bis e 2482-ter c.c.').riscontrate
    ).toHaveLength(1);
  });

  it('estrae le forme più comuni e le normalizza', () => {
    const chiavi = estraiCitazioni(
      'Ai sensi dell’art. 25-novies CCII e dell’art. 63, comma 4, del D.Lgs. 14/2019; il D.L. 269/2003, art. 44 impone il flusso Uniemens (D.M. 26 ottobre 2009). Rilevano gli artt. 2482-bis e 2482-ter c.c. e la circolare INPS n. 28/2023.'
    ).map((c) => c.chiave);
    expect(chiavi).toEqual(
      expect.arrayContaining([
        'ccii art 25-novies',
        'dlgs 14/2019 art 63',
        'dl 269/2003 art 44',
        'dm 26 ottobre 2009',
        'cc art 2482-bis',
        'cc art 2482-ter',
        'circ inps 28/2023',
      ])
    );
  });

  it('ogni fonte del registro è raggiungibile da almeno una chiave', () => {
    for (const f of FONTI) {
      if (f.id === 'INPS-ruoli-lettera-d') continue; // prassi senza estremi
      expect(chiaviFonte(f).length, f.id).toBeGreaterThan(0);
    }
  });

  it('riscontra sul registro: verificata, non sostenibile, assente', () => {
    const r = riscontraCitazioni(
      'L’art. 25-novies CCII e il D.L. 269/2003, art. 44 sono nel registro; l’art. 13, comma 2, CCII è abrogato; il D.M. 26 ottobre 2009 non esiste nel registro.'
    );
    expect(r.riscontrate.map((x) => x.fonte.id)).toEqual(
      expect.arrayContaining(['CCII-25novies-c1-a', 'DL269-2003-44-c9'])
    );
    expect(r.nonSostenibili.map((x) => x.fonte.id)).toContain('CCII-13-c2-originario');
    expect(r.nonInRegistro.map((x) => x.chiave)).toEqual(['dm 26 ottobre 2009']);
  });
});
