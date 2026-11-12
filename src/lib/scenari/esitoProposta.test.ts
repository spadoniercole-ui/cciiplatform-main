import { describe, expect, it } from 'vitest';
import {
  ESITI_PROPOSTA,
  etichettaEsitoProposta,
  esitoPropostaValido,
  MESSAGGIO_NON_EQUIPARABILI,
} from './esitoProposta';

describe('esiti della proposta', () => {
  it('sono tre, e il cram down non è la definizione dell’accordo', () => {
    expect(ESITI_PROPOSTA.map((e) => e.codice)).toEqual([
      'DEFINIZIONE_ACCORDO',
      'APERTURA_LIQUIDAZIONE',
      'CRAM_DOWN',
    ]);
    const cramDown = ESITI_PROPOSTA.find((e) => e.codice === 'CRAM_DOWN')!;
    const accordo = ESITI_PROPOSTA.find((e) => e.codice === 'DEFINIZIONE_ACCORDO')!;
    // Chi decide è diverso: il voto per l'accordo, il provvedimento per il cram down.
    expect(accordo.chiDecide).toContain('voto');
    expect(cramDown.chiDecide).toContain('provvedimento');
    expect(cramDown.descrizione).toContain('senza');
  });

  it('riconosce solo i tre codici ammessi', () => {
    expect(esitoPropostaValido('CRAM_DOWN')).toBe(true);
    expect(esitoPropostaValido('ACCORDO')).toBe(false);
    expect(esitoPropostaValido(null)).toBe(false);
    expect(esitoPropostaValido(undefined)).toBe(false);
  });

  it('l’etichetta di un esito assente dice che non è indicato', () => {
    expect(etichettaEsitoProposta(null)).toBe('non indicato');
    expect(etichettaEsitoProposta('APERTURA_LIQUIDAZIONE')).toContain('liquidazione');
  });

  it('il confine fra accordo e cram down è dichiarato per esteso', () => {
    expect(MESSAGGIO_NON_EQUIPARABILI).toContain('voto dei creditori');
    expect(MESSAGGIO_NON_EQUIPARABILI).toContain('provvedimento');
  });
});
