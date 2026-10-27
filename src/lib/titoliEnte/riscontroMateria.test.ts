import { describe, expect, it } from 'vitest';
import {
  copertoDallaMateria,
  riscontroDallaMateria,
  riscontroEffettivo,
  type MateriaPerRiscontro,
} from './riscontroMateria';
import { RISCONTRO_VUOTO, type RiscontroFonte, type TitoloEnte } from './titoli';

const materia = (p: Partial<MateriaPerRiscontro> = {}): MateriaPerRiscontro => ({
  id: 10,
  nome: 'Variazioni flussi VIG',
  stato: 'CONFERMATA',
  presuppostoGiuridico: 'Art. 2, comma 18, legge 8 agosto 1995, n. 335',
  riferimentiInterni: 'circolare n. 162 del 27-12-2010',
  proposta: {
    presupposti: [
      {
        norma: 'Art. 2, comma 18, legge 8 agosto 1995, n. 335',
        url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1995-08-08;335',
        estratto: null,
      },
    ],
    riferimenti: [],
    sintesi: null,
    generataIl: '2026-09-23',
    conFonteUfficiale: true,
  },
  confermataDa: 'ADMIN_SPAZIO',
  confermataIl: '2026-09-23T10:00:00.000Z',
  ...p,
});

const codice = (p: Partial<TitoloEnte> = {}): TitoloEnte => ({
  id: 1,
  codice: '11',
  atto: 'REGOLARIZZAZIONE SPONTANEA INPS',
  presuppostoGiuridico: '',
  riferimentoInterno: null,
  effettoCalcolo: 'NESSUNO',
  note: null,
  riscontroNorma: RISCONTRO_VUOTO,
  riscontroInterno: RISCONTRO_VUOTO,
  materiaId: 10,
  ...p,
});

const riscontro = (
  esito: RiscontroFonte['esito'],
  p: Partial<RiscontroFonte> = {}
): RiscontroFonte => ({
  ...RISCONTRO_VUOTO,
  esito,
  ...p,
});

describe('riscontro ereditato dalla materia', () => {
  it('una materia confermata copre il presupposto e i suoi riferimenti interni', () => {
    const m = materia();
    const norma = riscontroDallaMateria('norma', m);
    expect(norma?.esito).toBe('CONFERMATO');
    expect(norma?.estratto).toContain('legge 8 agosto 1995');
    expect(norma?.url).toContain('normattiva.it');
    expect(norma?.confermatoDa).toBe('ADMIN_SPAZIO');
    expect(norma?.motivo).toContain('Variazioni flussi VIG');

    const interno = riscontroDallaMateria('interno', m);
    expect(interno?.esito).toBe('CONFERMATO');
    expect(interno?.estratto).toContain('circolare n. 162');
  });

  it('la materia non confermata, o senza il contenuto da verificare, non copre nulla', () => {
    expect(riscontroDallaMateria('norma', materia({ stato: 'PROPOSTA' }))).toBeNull();
    expect(riscontroDallaMateria('norma', materia({ stato: 'DA_RICERCARE' }))).toBeNull();
    expect(riscontroDallaMateria('norma', null)).toBeNull();
    expect(riscontroDallaMateria('norma', materia({ presuppostoGiuridico: '  ' }))).toBeNull();
    // Confermata solo nel presupposto: il riferimento interno non è coperto.
    expect(
      riscontroDallaMateria('interno', materia({ riferimentiInterni: null, proposta: null }))
    ).toBeNull();
  });

  it('le circolari proposte bastano a coprire il riferimento interno anche senza testo', () => {
    const m = materia({
      riferimentiInterni: null,
      proposta: {
        presupposti: [],
        riferimenti: [
          {
            tipo: 'circolare',
            estremi: 'n. 162 del 27-12-2010',
            titolo: null,
            url: 'https://www.inps.it/x',
          },
        ],
        sintesi: null,
        generataIl: '2026-09-23',
        conFonteUfficiale: true,
      },
    });
    const r = riscontroDallaMateria('interno', m);
    expect(r?.esito).toBe('CONFERMATO');
    expect(r?.estratto).toBeNull();
    expect(r?.url).toContain('inps.it');
  });

  it('il codice che non ha ancora un esito legge quello della materia', () => {
    const eff = riscontroEffettivo('norma', codice(), [materia()]);
    expect(eff.riscontro.esito).toBe('CONFERMATO');
    expect(eff.dallaMateria).toBe(true);
    expect(eff.materia).toBe('Variazioni flussi VIG');
  });

  it('il «da riscontrare» della ricerca automatica non cancella la materia confermata', () => {
    const eff = riscontroEffettivo(
      'interno',
      codice({
        riscontroInterno: riscontro('NON_VERIFICABILE', { motivo: 'Fonte non raggiungibile.' }),
      }),
      [materia()]
    );
    expect(eff.dallaMateria).toBe(true);
    expect(eff.riscontro.esito).toBe('CONFERMATO');
  });

  it('un esito proprio del codice resta suo: conferma, contrasto e verifica in corso', () => {
    const proprio = riscontro('CONFERMATO', { url: 'https://www.gazzettaufficiale.it/x' });
    const eff = riscontroEffettivo('norma', codice({ riscontroNorma: proprio }), [materia()]);
    expect(eff.riscontro.url).toContain('gazzettaufficiale.it');
    expect(eff.dallaMateria).toBe(false);

    const contrasto = riscontro('IN_CONTRASTO', { motivo: 'L’articolo citato dice altro.' });
    const c = riscontroEffettivo('norma', codice({ riscontroNorma: contrasto }), [materia()]);
    expect(c.riscontro.esito).toBe('IN_CONTRASTO');
    expect(c.dallaMateria).toBe(false);

    const inCorso = riscontro('IN_CORSO', { eseguitoIl: '2026-10-27T09:00:00.000Z' });
    const v = riscontroEffettivo('norma', codice({ riscontroNorma: inCorso }), [materia()]);
    expect(v.riscontro.esito).toBe('IN_CORSO');
  });

  it('senza materia (o con la materia di un altro codice) resta l’esito del codice', () => {
    const senza = riscontroEffettivo('norma', codice({ materiaId: null }), [materia()]);
    expect(senza.riscontro.esito).toBe('NON_ESEGUITO');
    expect(senza.dallaMateria).toBe(false);
    const altra = riscontroEffettivo('norma', codice({ materiaId: 99 }), [materia()]);
    expect(altra.riscontro.esito).toBe('NON_ESEGUITO');
    expect(riscontroEffettivo('norma', codice(), []).riscontro.esito).toBe('NON_ESEGUITO');
  });

  it('la riga risulta coperta dalla materia anche quando lo è per un solo campo', () => {
    expect(copertoDallaMateria(codice(), [materia()])).toBe(true);
    expect(copertoDallaMateria(codice({ materiaId: null }), [materia()])).toBe(false);
  });
});
