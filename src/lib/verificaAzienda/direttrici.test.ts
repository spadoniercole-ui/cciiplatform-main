import { describe, expect, it } from 'vitest';
import { statoDirettrici, type SegnaliDirettrici } from './direttrici';

const segnali = (over: Partial<SegnaliDirettrici> = {}): SegnaliDirettrici => ({
  amministrativaLetta: true,
  contabile: { completa: true, anniXbrl: 3, visuraPresente: true },
  baseAziendaleSalvata: false,
  ...over,
});

describe('statoDirettrici', () => {
  it('la verifica aziendale è fatta solo con la fotografia salvata', () => {
    expect(statoDirettrici(segnali()).aziendale).toBe('PARZIALE');
    expect(statoDirettrici(segnali({ baseAziendaleSalvata: true })).aziendale).toBe('COMPLETO');
  });

  it('senza l’amministrativa i due lati non si incrociano: la aziendale non è cominciata', () => {
    expect(statoDirettrici(segnali({ amministrativaLetta: false }))).toEqual({
      amministrativa: 'MANCANTE',
      contabile: 'COMPLETO',
      aziendale: 'MANCANTE',
    });
  });

  it('contabile cominciata con la visura o con un bilancio, completa solo con tutto', () => {
    const visura = segnali({ contabile: { completa: false, anniXbrl: 0, visuraPresente: true } });
    expect(statoDirettrici(visura).contabile).toBe('PARZIALE');
    const bilancio = segnali({
      contabile: { completa: false, anniXbrl: 2, visuraPresente: false },
    });
    expect(statoDirettrici(bilancio).contabile).toBe('PARZIALE');
    const niente = segnali({ contabile: { completa: false, anniXbrl: 0, visuraPresente: false } });
    expect(statoDirettrici(niente).contabile).toBe('MANCANTE');
  });

  it('chi non legge la contabile non vede un verde finto', () => {
    expect(statoDirettrici(segnali({ contabile: null, baseAziendaleSalvata: true }))).toEqual({
      amministrativa: 'COMPLETO',
      contabile: 'NON_DISPONIBILE',
      aziendale: 'NON_DISPONIBILE',
    });
  });
});
