import { describe, expect, it } from 'vitest';
import type { IndiceCcii } from './types';
import { indiciVisibili, valoreIndice } from './indiciVisibili';

const indice = (
  codice: string,
  nome: string,
  valore: number,
  soglia: string,
  esito: IndiceCcii['esito']
): IndiceCcii => ({ codice, nome, valore, soglia, esito });

const cndcec: IndiceCcii[] = [
  indice('C1', 'Sostenibilità dei debiti', 1.26, '< 0.80', 'VIOLATO'),
  indice('C2', 'Adeguatezza patrimoniale', 0.06, '> 0.10', 'VIOLATO'),
];

const altri: IndiceCcii[] = [
  indice('ROE', 'Return on Equity', 4.2, 'informativo', 'OK'),
  indice('INC-DEB', "Incidenza dell'Indebitamento", 0.75, '< 0.70', 'VIOLATO'),
];

describe('indiciVisibili', () => {
  it('mostra un indice abilitato che sta nella seconda lista (prima spariva)', () => {
    const righe = indiciVisibili(['C1', 'INC-DEB'], cndcec, altri);

    expect(righe.map((r) => r.codice)).toEqual(['C1', 'INC-DEB']);
    expect(valoreIndice({ indici: cndcec, altriIndici: altri }, 'INC-DEB')?.valore).toBe(0.75);
  });

  it('senza abilitazioni mostra tutto il catalogo, CNDCEC prima', () => {
    expect(indiciVisibili([], cndcec, altri).map((r) => r.codice)).toEqual([
      'C1',
      'C2',
      'ROE',
      'INC-DEB',
    ]);
  });

  it('il DSCR abilitato resta in tabella dichiarato n/d, con il motivo', () => {
    const righe = indiciVisibili(['DSCR'], cndcec, altri);

    expect(righe).toHaveLength(1);
    expect(righe[0].codice).toBe('DSCR');
    expect(righe[0].motivoNonCalcolabile).toMatch(/rata/i);
  });

  it('un codice sconosciuto non diventa una riga inventata', () => {
    expect(indiciVisibili(['C1', 'INVENTATO'], cndcec, altri).map((r) => r.codice)).toEqual(['C1']);
  });

  it('un codice ripetuto compare una volta sola', () => {
    expect(indiciVisibili(['C1', 'C1'], cndcec, altri).map((r) => r.codice)).toEqual(['C1']);
  });
});
