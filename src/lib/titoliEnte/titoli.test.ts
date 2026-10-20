import { describe, it, expect } from 'vitest';
import {
  interpretaRiscontro,
  riscontroFermo,
  riscontroInCorso,
  riscontriDaEseguire,
  titoloPerCodice,
  validaTitolo,
  vociGiuridicheCambiate,
  MINUTI_PRIMA_DI_RIPROVARE,
  RISCONTRO_VUOTO,
  type RiscontroFonte,
  type TitoloEnte,
} from './titoli';

const titoli: TitoloEnte[] = [
  {
    id: 1,
    codice: '27',
    atto: 'DENUNCIA MENSILE INSOLUTA',
    presuppostoGiuridico: '',
    riferimentoInterno: null,
    effettoCalcolo: 'NESSUNO',
    note: null,
    riscontroNorma: RISCONTRO_VUOTO,
    riscontroInterno: RISCONTRO_VUOTO,
  },
  {
    id: 2,
    codice: '44',
    atto: 'PRATICA APERTA PER GESTIONE DILAZIONE',
    presuppostoGiuridico: '',
    riferimentoInterno: null,
    effettoCalcolo: 'NESSUNO',
    note: null,
    riscontroNorma: RISCONTRO_VUOTO,
    riscontroInterno: RISCONTRO_VUOTO,
  },
];

describe('riscontro: cosa lo fa ripartire', () => {
  const salvato = {
    atto: 'REGOLARIZZAZIONE SPONTANEA',
    presupposto_giuridico: 'Art. 2, comma 18, legge 8 agosto 1995, n. 335',
    riferimento_interno: 'messaggio 4973/2016',
  };
  const titolo = {
    atto: 'REGOLARIZZAZIONE SPONTANEA',
    presuppostoGiuridico: 'Art. 2, comma 18, legge 8 agosto 1995, n. 335',
    riferimentoInterno: 'messaggio 4973/2016',
  };

  it('la sola procedura di recupero non richiede un nuovo riscontro', () => {
    // La procedura non entra nel confronto: non è nemmeno un parametro.
    expect(vociGiuridicheCambiate(salvato, titolo)).toBe(false);
  });

  it('cambiare atto, presupposto o riferimento lo richiede', () => {
    expect(vociGiuridicheCambiate(salvato, { ...titolo, atto: 'ALTRO ATTO' })).toBe(true);
    expect(
      vociGiuridicheCambiate(salvato, { ...titolo, presuppostoGiuridico: 'Art. 2, comma 19' })
    ).toBe(true);
    expect(
      vociGiuridicheCambiate(salvato, { ...titolo, riferimentoInterno: 'circolare 1/2026' })
    ).toBe(true);
  });

  it('la prima volta c’è sempre da riscontrare', () => {
    expect(vociGiuridicheCambiate(null, titolo)).toBe(true);
    expect(vociGiuridicheCambiate(undefined, titolo)).toBe(true);
  });

  it('spazi ai bordi e riferimento vuoto non contano come modifiche', () => {
    expect(
      vociGiuridicheCambiate(
        { ...salvato, riferimento_interno: null },
        { ...titolo, riferimentoInterno: '  ' }
      )
    ).toBe(false);
    expect(vociGiuridicheCambiate(salvato, { ...titolo, atto: `  ${titolo.atto}  ` })).toBe(false);
  });
});

describe('riscontro in secondo piano', () => {
  const partito = '2026-10-20T09:00:00.000Z';

  it('«in verifica» non è un esito: nessuna fonte, nessun estratto', () => {
    const r = riscontroInCorso(partito);
    expect(r).toEqual({
      esito: 'IN_CORSO',
      estratto: null,
      url: null,
      motivo: 'Verifica sulle fonti ufficiali in corso.',
      eseguitoIl: partito,
      confermatoDa: null,
    });
  });

  it('la ricerca si considera interrotta solo dopo la soglia', () => {
    const r = riscontroInCorso(partito);
    const subitoDopo = new Date(partito).getTime() + 30 * 1000;
    const troppoTardi = new Date(partito).getTime() + (MINUTI_PRIMA_DI_RIPROVARE + 1) * 60 * 1000;
    expect(riscontroFermo(r, subitoDopo)).toBe(false);
    expect(riscontroFermo(r, troppoTardi)).toBe(true);
    // Un esito non in corso non è mai «fermo»: è arrivato.
    expect(riscontroFermo({ ...r, esito: 'CONFERMATO' }, troppoTardi)).toBe(false);
  });

  it('una ricerca in corso senza data di partenza si riprende', () => {
    const senzaData: RiscontroFonte = { ...riscontroInCorso(partito), eseguitoIl: null };
    expect(riscontroFermo(senzaData, new Date(partito).getTime())).toBe(true);
  });

  describe('quali ricerche servono al salvataggio', () => {
    const titolo = {
      atto: 'REGOLARIZZAZIONE SPONTANEA',
      presuppostoGiuridico: 'Art. 2, comma 18, legge 8 agosto 1995, n. 335',
      riferimentoInterno: 'messaggio 4973/2016',
    };
    const confermato: RiscontroFonte = {
      esito: 'CONFERMATO',
      estratto: 'passo',
      url: 'https://www.normattiva.it/x',
      motivo: null,
      eseguitoIl: '2026-10-19T10:00:00.000Z',
      confermatoDa: 'admin@ente.it',
    };
    // La riga salvata, in snake_case come la restituisce Postgres.
    const riga = {
      atto: titolo.atto,
      presupposto_giuridico: titolo.presuppostoGiuridico,
      riferimento_interno: titolo.riferimentoInterno,
    };

    it('senza modifiche non si ricerca nulla: gli esiti restano', () => {
      expect(
        riscontriDaEseguire(
          { ...riga, riscontro_norma: confermato, riscontro_interno: confermato },
          titolo,
          'inps.it'
        )
      ).toEqual({ norma: false, interno: false });
    });

    it('una modifica giuridica rimanda in verifica entrambe le fonti', () => {
      expect(
        riscontriDaEseguire(
          { ...riga, riscontro_norma: confermato, riscontro_interno: confermato },
          { ...titolo, presuppostoGiuridico: 'Art. 2, comma 19' },
          'inps.it'
        )
      ).toEqual({ norma: true, interno: true });
    });

    it('un «da riscontrare» archiviato non si riprova da solo', () => {
      const daRiscontrare: RiscontroFonte = { ...confermato, esito: 'NON_VERIFICABILE' };
      expect(
        riscontriDaEseguire(
          { ...riga, riscontro_norma: daRiscontrare, riscontro_interno: daRiscontrare },
          titolo,
          'inps.it'
        )
      ).toEqual({ norma: false, interno: false });
    });

    it('una ricerca lasciata «in verifica» si riprende al salvataggio', () => {
      expect(
        riscontriDaEseguire(
          {
            ...riga,
            riscontro_norma: riscontroInCorso(partito),
            riscontro_interno: confermato,
          },
          titolo,
          'inps.it'
        ).norma
      ).toBe(true);
    });

    it('senza presupposto, o senza sito dell’ente, non c’è nulla da ricercare', () => {
      expect(
        riscontriDaEseguire(null, { ...titolo, presuppostoGiuridico: '   ' }, 'inps.it')
      ).toEqual({ norma: false, interno: true });
      expect(riscontriDaEseguire(null, titolo, null)).toEqual({ norma: true, interno: false });
      expect(
        riscontriDaEseguire(
          null,
          { atto: 'x', presuppostoGiuridico: '', riferimentoInterno: null },
          null
        )
      ).toEqual({
        norma: false,
        interno: false,
      });
    });
  });
});

describe('titoli di credito dell’ente', () => {
  it('il codice dice il titolo e basta: nessun effetto sul calcolo', () => {
    expect(titoloPerCodice(titoli, '44')?.atto).toContain('DILAZIONE');
  });
  it('trova il codice anche con zeri iniziali e spazi', () => {
    expect(titoloPerCodice(titoli, ' 027 ')?.codice).toBe('27');
    expect(titoloPerCodice(titoli, '99')).toBeNull();
  });
  it('valida: codice e atto obbligatori', () => {
    expect(validaTitolo({ codice: '27', atto: 'x' })).toBeNull();
    expect(validaTitolo({ codice: '', atto: 'x' })).toContain('Codice');
    expect(validaTitolo({ codice: '27', atto: '' })).toContain('atto');
  });
  it('un «confermato» senza fonte ufficiale non vale come conferma', () => {
    expect(
      interpretaRiscontro({ esito: 'CONFERMATO', url: 'https://www.brocardi.it/x' }, '2026-09-23')
        .esito
    ).toBe('NON_VERIFICABILE');
    expect(
      interpretaRiscontro(
        { esito: 'CONFERMATO', url: 'https://www.normattiva.it/x', estratto: 'passo' },
        '2026-09-23'
      ).esito
    ).toBe('CONFERMATO');
    expect(interpretaRiscontro({ esito: 'in_contrasto', url: null }, '2026-09-23').esito).toBe(
      'IN_CONTRASTO'
    );
    expect(interpretaRiscontro('spazzatura', '2026-09-23').esito).toBe('NON_VERIFICABILE');
  });
});
