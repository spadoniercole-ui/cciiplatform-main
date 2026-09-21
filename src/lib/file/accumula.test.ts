import { describe, it, expect } from 'vitest';
import { accumulaFile, togliFile } from './accumula';

const f = (nome: string, dim = 10) => new File([new Uint8Array(dim)], nome);

describe('accumulo dei file caricati', () => {
  it('una seconda scelta si AGGIUNGE alla prima, non la sostituisce', () => {
    // Il caso reale: bilancio 2022 caricato, poi bilancio 2021 — e il primo
    // spariva.
    const primo = f('OUT_LASTBIL 22.xbrl');
    const secondo = f('OUT_LASTBIL 21.xbrl');
    const elenco = accumulaFile(accumulaFile([], [primo]), [secondo]);
    expect(elenco.map((x) => x.name)).toEqual(['OUT_LASTBIL 22.xbrl', 'OUT_LASTBIL 21.xbrl']);
  });

  it('lo stesso file scelto due volte non si duplica', () => {
    const elenco = accumulaFile(accumulaFile([], [f('bilancio.xbrl', 50)]), [
      f('bilancio.xbrl', 50),
    ]);
    expect(elenco).toHaveLength(1);
  });

  it('due file con lo stesso nome ma diversi restano entrambi', () => {
    const elenco = accumulaFile([f('prospetto.xlsx', 10)], [f('prospetto.xlsx', 20)]);
    expect(elenco).toHaveLength(2);
  });

  it('un file si toglie senza toccare gli altri', () => {
    const a = f('a.xbrl');
    const b = f('b.xbrl');
    expect(togliFile([a, b], a)).toEqual([b]);
  });
});
