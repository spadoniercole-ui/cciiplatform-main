import { describe, expect, it } from 'vitest';
import { avanzamentoPosizioni, conteggioFasi } from './avanzamento';

const verifiche = [
  { id: 1, ragioneSociale: 'Alfa S.r.l.' },
  { id: 2, ragioneSociale: 'Beta S.r.l.' },
];
const contabile = [
  { id: 1, ragioneSociale: 'Alfa S.r.l.', completa: true, anniXbrl: 3, visuraPresente: true },
  { id: 2, ragioneSociale: 'Beta S.r.l.', completa: false, anniXbrl: 0, visuraPresente: true },
];
const azienda = [
  { id: 1, ragioneSociale: 'Alfa S.r.l.', debitoMemorizzato: 205000, anniXbrl: 3 },
  { id: 2, ragioneSociale: 'Beta S.r.l.', debitoMemorizzato: null, anniXbrl: 0 },
];

describe('avanzamentoPosizioni', () => {
  it('mette in fila le quattro tappe per azienda', () => {
    const righe = avanzamentoPosizioni({ verifiche, contabile, azienda, scenari: [] });
    const alfa = righe.find((r) => r.aziendaId === 1)!;
    const beta = righe.find((r) => r.aziendaId === 2)!;
    expect([alfa.amministrativa, alfa.contabile, alfa.aziendale, alfa.scenari]).toEqual([
      'COMPLETO',
      'COMPLETO',
      'COMPLETO',
      'MANCANTE',
    ]);
    expect(alfa.tappeComplete).toBe(3);
    expect(alfa.fase).toBe('Completa aziendale');
    // Beta ha la visura ma nessun bilancio: cominciata, non completa. La fase
    // è dove si sta lavorando, quindi la contabile (parziale), non
    // l'amministrativa già chiusa.
    expect(beta.contabile).toBe('PARZIALE');
    expect(beta.fase).toBe('Contabile');
  });

  it('ordina in testa chi ha fatto più tappe', () => {
    const righe = avanzamentoPosizioni({ verifiche, contabile, azienda, scenari: [] });
    expect(righe[0].aziendaId).toBe(1);
  });

  it('per un operatore le tappe non leggibili sono «non disponibile», non «mancante»', () => {
    const righe = avanzamentoPosizioni({
      verifiche,
      contabile: null,
      azienda: null,
      scenari: [],
    });
    expect(righe.every((r) => r.contabile === 'NON_DISPONIBILE')).toBe(true);
    expect(righe.every((r) => r.aziendale === 'NON_DISPONIBILE')).toBe(true);
    expect(righe[0].tappeComplete).toBe(1);
  });

  it('uno scenario porta la posizione alla fase «Scenari»', () => {
    const righe = avanzamentoPosizioni({
      verifiche,
      contabile,
      azienda,
      scenari: [{ aziendaRagioneSociale: 'Alfa S.r.l.' }, { aziendaRagioneSociale: 'Alfa S.r.l.' }],
    });
    const alfa = righe.find((r) => r.aziendaId === 1)!;
    expect(alfa.scenari).toBe('COMPLETO');
    expect(alfa.scenariCreati).toBe(2);
    expect(alfa.fase).toBe('Scenari');
    expect(alfa.tappeComplete).toBe(4);
  });

  it('uno scenario senza azienda in elenco resta visibile', () => {
    const righe = avanzamentoPosizioni({
      verifiche,
      contabile,
      azienda,
      scenari: [{ aziendaRagioneSociale: 'Gamma S.p.A.' }],
    });
    const gamma = righe.find((r) => r.ragioneSociale === 'Gamma S.p.A.')!;
    expect(gamma.aziendaId).toBeNull();
    expect(gamma.scenari).toBe('COMPLETO');
    expect(gamma.amministrativa).toBe('MANCANTE');
  });
});

describe('conteggioFasi', () => {
  it('conta le posizioni per fase, comprese quelle a zero', () => {
    const righe = avanzamentoPosizioni({ verifiche, contabile, azienda, scenari: [] });
    const conteggi = conteggioFasi(righe);
    expect(conteggi.find((c) => c.fase === 'Completa aziendale')?.quante).toBe(1);
    expect(conteggi.find((c) => c.fase === 'Scenari')?.quante).toBe(0);
  });
});
