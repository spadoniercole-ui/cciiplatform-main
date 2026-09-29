import { describe, it, expect } from 'vitest';
import { RANGHI_LEGALI, etichettaRango, raggruppaPerRango, type RigaConRango } from './rangoLegale';

describe('etichettaRango', () => {
  it('null o undefined → "Non classificato"', () => {
    expect(etichettaRango(null)).toBe('Non classificato');
    expect(etichettaRango(undefined)).toBe('Non classificato');
  });

  it('ogni rango ha la sua etichetta', () => {
    for (const r of RANGHI_LEGALI) expect(etichettaRango(r.valore)).toBe(r.etichetta);
    expect(etichettaRango('PRIVILEGIATO_IPOTECA')).toBe('Privilegiato — assistito da ipoteca');
  });

  it('un valore sconosciuto viene mostrato così com’è', () => {
    expect(etichettaRango('IPOTECARIO' as never)).toBe('IPOTECARIO');
  });
});

describe('raggruppaPerRango', () => {
  const righe: RigaConRango[] = [
    {
      categoriaCreditore: 'Banca',
      importoDovuto: 10000,
      percentualeOfferta: 30,
      rangoLegale: 'CHIROGRAFARIO',
    },
    {
      categoriaCreditore: 'Fornitore',
      importoDovuto: 5000,
      percentualeOfferta: 20,
      rangoLegale: null,
    },
    {
      categoriaCreditore: 'Banca',
      importoDovuto: 50000,
      percentualeOfferta: 100,
      rangoLegale: 'PRIVILEGIATO_IPOTECA',
    },
    {
      categoriaCreditore: 'Fornitore',
      importoDovuto: 2000,
      percentualeOfferta: 30,
      rangoLegale: 'CHIROGRAFARIO',
    },
    {
      categoriaCreditore: 'Banca',
      importoDovuto: 3000,
      percentualeOfferta: 30,
      rangoLegale: 'CHIROGRAFARIO',
    },
    {
      categoriaCreditore: 'Professionista',
      importoDovuto: 8000,
      percentualeOfferta: 100,
      rangoLegale: 'PREDEDUCIBILE',
    },
    {
      categoriaCreditore: 'Socio',
      importoDovuto: 1000,
      percentualeOfferta: 0,
      rangoLegale: 'POSTERGATO',
    },
  ];

  it('ordina per rango legale con i non classificati in fondo', () => {
    expect(raggruppaPerRango(righe).map((r) => r.rango)).toEqual([
      'PREDEDUCIBILE',
      'PRIVILEGIATO_IPOTECA',
      'CHIROGRAFARIO',
      'POSTERGATO',
      null,
    ]);
  });

  it('segue l’ordine completo dei ranghi indipendentemente dall’ordine di input', () => {
    const tutte: RigaConRango[] = [null, ...RANGHI_LEGALI.map((r) => r.valore)]
      .reverse()
      .map((rango) => ({
        categoriaCreditore: 'X',
        importoDovuto: 1,
        percentualeOfferta: 100,
        rangoLegale: rango,
      }));
    expect(raggruppaPerRango(tutte).map((r) => r.rango)).toEqual([
      'PREDEDUCIBILE',
      'PRIVILEGIATO_IPOTECA',
      'PRIVILEGIATO_GENERALE',
      'PRIVILEGIATO',
      'CHIROGRAFARIO',
      'POSTERGATO',
      null,
    ]);
  });

  it('somma dovuto e offerto (dovuto × percentuale / 100) per rango', () => {
    const chiro = raggruppaPerRango(righe).find((r) => r.rango === 'CHIROGRAFARIO')!;
    expect(chiro.numeroRighe).toBe(3);
    expect(chiro.totaleDovuto).toBe(15000);
    expect(chiro.totaleOfferto).toBeCloseTo(4500, 6);
    expect(chiro.etichetta).toBe('Chirografario');
  });

  it('elenca i creditori una sola volta, in ordine di comparsa', () => {
    const chiro = raggruppaPerRango(righe).find((r) => r.rango === 'CHIROGRAFARIO')!;
    expect(chiro.creditori).toEqual(['Banca', 'Fornitore']);
  });

  it('raggruppa le righe senza rango sotto "Non classificato"', () => {
    const nessuno = raggruppaPerRango(righe).at(-1)!;
    expect(nessuno).toEqual({
      rango: null,
      etichetta: 'Non classificato',
      numeroRighe: 1,
      totaleDovuto: 5000,
      totaleOfferto: 1000,
      creditori: ['Fornitore'],
    });
  });

  it('percentuale 0 → offerto 0; nessuna riga → elenco vuoto', () => {
    const post = raggruppaPerRango(righe).find((r) => r.rango === 'POSTERGATO')!;
    expect(post.totaleOfferto).toBe(0);
    expect(raggruppaPerRango([])).toEqual([]);
  });

  it('la somma dei totali per rango coincide con il totale delle righe', () => {
    const gruppi = raggruppaPerRango(righe);
    const dovuto = righe.reduce((a, r) => a + r.importoDovuto, 0);
    const offerto = righe.reduce((a, r) => a + (r.importoDovuto * r.percentualeOfferta) / 100, 0);
    expect(gruppi.reduce((a, g) => a + g.totaleDovuto, 0)).toBe(dovuto);
    expect(gruppi.reduce((a, g) => a + g.totaleOfferto, 0)).toBeCloseTo(offerto, 6);
  });

  it('un rango sconosciuto (valore legacy letto dal DB) va in fondo, dopo i non classificati', () => {
    const conLegacy: RigaConRango[] = [
      ...righe,
      {
        categoriaCreditore: 'Banca',
        importoDovuto: 7000,
        percentualeOfferta: 50,
        rangoLegale: 'IPOTECARIO' as never,
      },
    ];
    expect(raggruppaPerRango(conLegacy).map((r) => r.rango)).toEqual([
      'PREDEDUCIBILE',
      'PRIVILEGIATO_IPOTECA',
      'CHIROGRAFARIO',
      'POSTERGATO',
      null,
      'IPOTECARIO',
    ]);
  });
  it.todo('percentualeOfferta fuori da 0–100 (es. 150) non è limitata: offerto > dovuto');
});
