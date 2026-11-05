import { describe, expect, it } from 'vitest';
import {
  etichettaIstruttoria,
  normalizzaLettura,
  numeroDaTesto,
  promptLetturaProvvedimento,
  rangoDaTesto,
  tipoAttoValido,
} from './lettura';

describe('lettura del provvedimento del giudice', () => {
  it('legge importi e percentuali come li scrive un atto italiano', () => {
    expect(numeroDaTesto('1.234,56 €')).toBe(1234.56);
    expect(numeroDaTesto('29.664 €')).toBe(29664);
    expect(numeroDaTesto('35%')).toBe(35);
    expect(numeroDaTesto('0,35')).toBe(0.35);
    expect(numeroDaTesto('non indicato')).toBeNull();
  });

  it('riconosce il rango dal codice o dal testo, e non lo inventa', () => {
    expect(rangoDaTesto('PRIVILEGIATO')).toBe('PRIVILEGIATO');
    expect(rangoDaTesto('credito chirografario')).toBe('CHIROGRAFARIO');
    expect(rangoDaTesto('credito con prelazione ipotecaria')).toBe('PRIVILEGIATO');
    expect(rangoDaTesto('credito sorto nella procedura')).toBe('PREDEDUCIBILE');
    expect(rangoDaTesto('creditore sociale')).toBeNull();
  });

  it('scarta i crediti senza voce o senza importo invece di inventarli', () => {
    const lettura = normalizzaLettura({
      dataAtto: '2026-09-30',
      speseProceduraPct: '8%',
      tempiMesi: '36',
      crediti: [
        { voce: 'Contributi INPS', importo: '29.664 €', rango: 'privilegiato' },
        { voce: '', importo: 1000 },
        { voce: 'Senza importo' },
        { voce: 'Credito erariale', importo: '1.234,56', rango: 'chirografario' },
      ],
      note: ['Il decreto non riporta lo stato passivo'],
    });
    expect(lettura.crediti).toHaveLength(2);
    expect(lettura.crediti[0]).toMatchObject({
      voce: 'Contributi INPS',
      importo: 29664,
      rango: 'PRIVILEGIATO',
      percentualeRealizzo: null,
    });
    expect(lettura.speseProceduraPct).toBe(8);
    expect(lettura.tempiMesi).toBe(36);
    expect(lettura.dataAtto).toBe('2026-09-30');
    expect(lettura.note).toHaveLength(1);
  });

  it('una percentuale fuori scala non diventa un dato', () => {
    const lettura = normalizzaLettura({
      crediti: [{ voce: 'Credito', importo: 100, percentualeRealizzo: 140 }],
    });
    expect(lettura.crediti[0].percentualeRealizzo).toBeNull();
  });

  it('il prompt vieta di dedurre ciò che l’atto non dice', () => {
    const p = promptLetturaProvvedimento('CRAM_DOWN', '');
    expect(p).toContain("Se un dato non c'è, valore null");
    expect(p).toContain('Non dedurre il rango');
    expect(p).toContain('dispositivo');
  });

  it('accetta solo i tre atti previsti', () => {
    expect(tipoAttoValido('PROPOSTA')).toBe(true);
    expect(tipoAttoValido('DECRETO_LIQUIDAZIONE')).toBe(true);
    expect(tipoAttoValido('CRAM_DOWN')).toBe(true);
    expect(tipoAttoValido('DA_CHIEDERE')).toBe(false);
    expect(tipoAttoValido('altro')).toBe(false);
  });

  it('dà un’etichetta leggibile al percorso, anche quando è ancora da scegliere', () => {
    expect(etichettaIstruttoria('PROPOSTA')).toBe('Proposta');
    expect(etichettaIstruttoria('DECRETO_LIQUIDAZIONE')).toBe('Decreto di liquidazione giudiziale');
    expect(etichettaIstruttoria('CRAM_DOWN')).toBe('Dispositivo di cram down');
    expect(etichettaIstruttoria('DA_CHIEDERE')).toBe('Percorso da definire');
    expect(etichettaIstruttoria(null)).toBe('Percorso da definire');
  });
});
