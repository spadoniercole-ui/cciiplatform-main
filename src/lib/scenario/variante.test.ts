import { describe, expect, it } from 'vitest';
import {
  mostraRigheProposta,
  richiedeProvvedimento,
  VARIANTI_SCENARIO,
  varianteIniziale,
  varianteValida,
  voceVariante,
} from './variante';

describe('varianti dello scenario', () => {
  it('sono tre, e solo due chiedono un provvedimento', () => {
    expect(VARIANTI_SCENARIO).toHaveLength(3);
    expect(richiedeProvvedimento('PROPOSTA_AZIENDA')).toBe(false);
    expect(richiedeProvvedimento('CRAM_DOWN')).toBe(true);
    expect(richiedeProvimentoDecreto()).toBe(true);
  });

  it('riconosce solo i valori ammessi', () => {
    expect(varianteValida('CRAM_DOWN')).toBe(true);
    expect(varianteValida('cram_down')).toBe(false);
    expect(varianteValida(null)).toBe(false);
    expect(varianteValida('ALTRO')).toBe(false);
  });

  it('uno scenario ricevuto parte dalla proposta, gli altri da nessuna variante', () => {
    expect(varianteIniziale('RICEVUTA')).toBe('PROPOSTA_AZIENDA');
    expect(varianteIniziale('DA_DEFINIRE')).toBeNull();
    expect(varianteIniziale(null)).toBeNull();
  });

  it('le righe della proposta si mostrano solo nella trattativa', () => {
    expect(mostraRigheProposta(null)).toBe(true);
    expect(mostraRigheProposta('PROPOSTA_AZIENDA')).toBe(true);
    expect(mostraRigheProposta('CRAM_DOWN')).toBe(false);
    expect(mostraRigheProposta('DECRETO_LIQUIDAZIONE')).toBe(false);
  });

  it('una variante sconosciuta non ha etichetta', () => {
    expect(voceVariante('ALTRO')).toBeNull();
    expect(voceVariante('CRAM_DOWN')?.etichetta).toContain('Cram down');
  });
});

function richiedeProvimentoDecreto() {
  return richiedeProvvedimento('DECRETO_LIQUIDAZIONE');
}
