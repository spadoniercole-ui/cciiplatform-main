import { describe, it, expect } from 'vitest';
import { sintetizzaSoglie } from './sintesi';

describe('sintesi di più soglie in un solo esito', () => {
  it('spazio ENTE, una riga sola: la sintesi è la riga', () => {
    expect(sintetizzaSoglie(1, 1, 0)).toBe(true);
    expect(sintetizzaSoglie(1, 0, 0)).toBe(false);
    expect(sintetizzaSoglie(1, 0, 1)).toBeNull();
  });

  it('REDIGENTE: una soglia superata vale anche con lacune altrove', () => {
    // È il difetto corretto: bastava una riga non determinabile perché
    // l'INTERO esito diventasse indeterminato, nascondendo una soglia
    // effettivamente superata dietro la mancanza di un dato che riguardava
    // un altro ente.
    expect(sintetizzaSoglie(4, 1, 2)).toBe(true);
  });

  it('nessuna superata ma dati mancanti: non si conclude', () => {
    // La risposta potrebbe stare proprio nel dato che manca.
    expect(sintetizzaSoglie(4, 0, 1)).toBeNull();
  });

  it('nessuna superata e tutto determinabile: esito negativo netto', () => {
    expect(sintetizzaSoglie(4, 0, 0)).toBe(false);
  });

  it('nessuna riga applicabile: niente da valutare', () => {
    expect(sintetizzaSoglie(0, 0, 0)).toBeNull();
    expect(sintetizzaSoglie(0, 0, 3)).toBeNull();
  });
});
