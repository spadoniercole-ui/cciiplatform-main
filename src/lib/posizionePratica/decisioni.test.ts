import { describe, expect, it } from 'vitest';
import {
  ESITI_DECISIONE_CODICI,
  MOTIVAZIONE_MINIMA,
  etichettaEsito,
  riassuntoDecisione,
  validaDecisione,
  type BozzaDecisione,
} from './decisioni';

const bozza = (patch: Partial<BozzaDecisione> = {}): BozzaDecisione => ({
  esito: 'PROSEGUI',
  motivazione: 'La cassa copre il credito e il piano in essere è rispettato.',
  autore: 'mario.rossi',
  credito: 80_000,
  copertura: '4/4',
  ...patch,
});

describe('decisione sulla posizione', () => {
  it('una decisione con esito, motivo e autore è valida', () => {
    expect(validaDecisione(bozza()).valida).toBe(true);
  });

  it('un esito inventato non passa', () => {
    const v = validaDecisione(bozza({ esito: 'BOCCIATA' as never }));
    expect(v.valida).toBe(false);
    expect(v.errore).toContain('non è riconosciuto');
  });

  it('una motivazione sotto la soglia non è un motivo', () => {
    const v = validaDecisione(bozza({ motivazione: 'ok' }));
    expect(v.valida).toBe(false);
    expect(v.errore).toContain(String(MOTIVAZIONE_MINIMA));
  });

  it('senza autore la traccia non è una traccia', () => {
    const v = validaDecisione(bozza({ autore: '   ' }));
    expect(v.valida).toBe(false);
    expect(v.errore).toContain('Manca chi decide');
  });

  it('un credito negativo è un dato da correggere', () => {
    expect(validaDecisione(bozza({ credito: -1 })).valida).toBe(false);
    expect(validaDecisione(bozza({ credito: null })).valida).toBe(true);
  });

  it('le etichette degli esiti sono registrate', () => {
    expect(ESITI_DECISIONE_CODICI).toContain('CHIEDI_DOCUMENTI');
    expect(etichettaEsito('CHIEDI_DOCUMENTI')).toBe('Chiedere documenti');
  });

  it('il riassunto porta autore, credito e copertura', () => {
    const r = riassuntoDecisione({ ...bozza(), id: 1, decisaIl: '2026-11-16T10:00:00.000Z' });
    expect(r).toContain('Proseguire');
    expect(r).toContain('mario.rossi');
    expect(r).toContain('80.000 €');
    expect(r).toContain('4/4');
  });
});
