import { describe, it, expect } from 'vitest';
import {
  interpretaRiscontro,
  titoloPerCodice,
  validaTitolo,
  RISCONTRO_VUOTO,
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
