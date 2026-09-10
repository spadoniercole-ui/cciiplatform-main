import { describe, it, expect } from 'vitest';
import { valutaValidita, MESI_VALIDITA_VERIFICA } from './validitaVerifica';

const oggi = new Date('2026-09-10T12:00:00Z');
const giorniFa = (n: number) => new Date(oggi.getTime() - n * 86_400_000).toISOString();
const limite = MESI_VALIDITA_VERIFICA * 30;

describe('validità di una verifica', () => {
  it('una verifica di oggi è recente', () => {
    expect(valutaValidita(giorniFa(0), oggi).stato).toBe('recente');
    expect(valutaValidita(giorniFa(30), oggi).stato).toBe('recente');
  });

  it('nell’ultimo mese di validità avvisa PRIMA che scada', () => {
    // Avvisare dopo la scadenza è inutile: serve il tempo di rifarla.
    expect(valutaValidita(giorniFa(limite - 1), oggi).stato).toBe('in_scadenza');
    expect(valutaValidita(giorniFa(limite - 30), oggi).stato).toBe('in_scadenza');
    expect(valutaValidita(giorniFa(limite - 31), oggi).stato).toBe('recente');
  });

  it('oltre il limite va rivista', () => {
    expect(valutaValidita(giorniFa(limite), oggi).stato).toBe('da_rivedere');
    expect(valutaValidita(giorniFa(limite + 200), oggi).stato).toBe('da_rivedere');
  });

  it('mai eseguita equivale a da rivedere', () => {
    const v = valutaValidita(null, oggi);
    expect(v.stato).toBe('da_rivedere');
    expect(v.etichetta).toBe('Mai verificata');
  });

  it('una data futura non produce numeri negativi', () => {
    // Dato incoerente (fuso orario, orologio del server): non è una verifica
    // freschissima, ma nemmeno un errore da mostrare all'utente.
    const v = valutaValidita(new Date(oggi.getTime() + 86_400_000).toISOString(), oggi);
    expect(v.giorni).toBe(0);
    expect(v.stato).toBe('recente');
  });

  it('l’etichetta è leggibile, non un numero di giorni grezzo', () => {
    expect(valutaValidita(giorniFa(limite + 60), oggi).etichetta).toContain('mesi');
    expect(valutaValidita(giorniFa(0), oggi).etichetta).toBe('Oggi');
  });
});
