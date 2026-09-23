import { describe, it, expect } from 'vitest';
import {
  interpretaRiscontro,
  titoloPerCodice,
  validaTitolo,
  TITOLI_INPS_PREDEFINITI,
  RISCONTRO_VUOTO,
} from './titoli';

const titoli = TITOLI_INPS_PREDEFINITI.map((t, i) => ({
  ...t,
  id: i + 1,
  riscontroNorma: RISCONTRO_VUOTO,
  riscontroInterno: RISCONTRO_VUOTO,
}));

describe('titoli di credito dell’ente', () => {
  it('i sei codici di Ercole sono precaricati; il 44 interrompe il ritardo', () => {
    expect(titoli.map((t) => t.codice)).toEqual(['27', '25', '34', '44', '81', '74']);
    expect(titoloPerCodice(titoli, '44')?.effettoCalcolo).toBe('INTERROMPE_RITARDO');
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
