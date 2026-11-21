import { describe, expect, it } from 'vitest';
import {
  avanzamentoPosizioni,
  conteggioFasi,
  hrefPosizione,
  type AvanzamentoPosizione,
} from './avanzamento';

const verifiche = [
  { id: 1, ragioneSociale: 'Alfa S.r.l.' },
  { id: 2, ragioneSociale: 'Beta S.r.l.' },
];
const contabile = [
  { id: 1, ragioneSociale: 'Alfa S.r.l.', completa: true, anniXbrl: 3, visuraPresente: true },
  { id: 2, ragioneSociale: 'Beta S.r.l.', completa: false, anniXbrl: 0, visuraPresente: true },
];
const azienda = [
  { id: 1, ragioneSociale: 'Alfa S.r.l.', baseAziendaleSalvata: true },
  { id: 2, ragioneSociale: 'Beta S.r.l.', baseAziendaleSalvata: false },
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

  it('i due lati pronti non bastano: senza la fotografia la aziendale è cominciata', () => {
    // Prima il verde della terza tappa arrivava col debito memorizzato in
    // amministrativa, cioè con un dato in ingresso e non con la lettura.
    const righe = avanzamentoPosizioni({
      verifiche,
      contabile,
      azienda: [{ id: 1, ragioneSociale: 'Alfa S.r.l.', baseAziendaleSalvata: false }],
      scenari: [],
    });
    const alfa = righe.find((r) => r.aziendaId === 1)!;
    expect(alfa.aziendale).toBe('PARZIALE');
    expect(alfa.tappeComplete).toBe(2);
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

describe('hrefPosizione', () => {
  const stato = (
    s: Partial<
      Pick<
        AvanzamentoPosizione,
        'aziendaId' | 'amministrativa' | 'contabile' | 'aziendale' | 'scenari'
      >
    >
  ) =>
    ({
      aziendaId: 7,
      ragioneSociale: 'Alfa S.r.l.',
      amministrativa: 'MANCANTE',
      contabile: 'MANCANTE',
      aziendale: 'MANCANTE',
      scenari: 'MANCANTE',
      scenariCreati: 0,
      tappeComplete: 0,
      fase: 'Da iniziare',
      ...s,
    }) as AvanzamentoPosizione;

  it('apre la prima tappa cominciata, non la vecchia scheda', () => {
    // Contabile a metà: è lì che si sta lavorando, anche con
    // l'amministrativa già chiusa.
    const p = stato({ amministrativa: 'COMPLETO', contabile: 'PARZIALE' });
    expect(hrefPosizione(p, 'demo')).toBe('/spazio/demo/verifica-contabile/7');
  });

  it('senza nulla di cominciato apre il triage', () => {
    expect(hrefPosizione(stato({}), 'demo')).toBe('/spazio/demo/verifica-salute?azienda=7');
  });

  it('con le tre verifiche chiuse porta alla verifica aziendale, anche senza scenari', () => {
    const p = stato({
      amministrativa: 'COMPLETO',
      contabile: 'COMPLETO',
      aziendale: 'COMPLETO',
    });
    expect(hrefPosizione(p, 'demo')).toBe('/spazio/demo/verifica-azienda/7');
  });

  it('non manda in contabile chi non può leggerla', () => {
    const p = stato({
      amministrativa: 'COMPLETO',
      contabile: 'NON_DISPONIBILE',
      aziendale: 'NON_DISPONIBILE',
    });
    expect(hrefPosizione(p, 'demo')).toBe('/spazio/demo/verifica-azienda/7');
  });

  it('una posizione che esiste solo come scenario apre gli scenari', () => {
    const p = stato({ aziendaId: null, scenari: 'COMPLETO' });
    expect(hrefPosizione(p, 'demo')).toBe('/spazio/demo/scenari');
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
