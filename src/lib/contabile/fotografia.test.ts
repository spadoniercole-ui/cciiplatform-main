import { describe, expect, it } from 'vitest';
import type { DatiFinanziariPeriodo, IndiceCcii } from '@/lib/xbrl/types';
import { componiFotografia, type BilancioFotografia } from './fotografia';

const dati = (p: Partial<DatiFinanziariPeriodo> = {}): DatiFinanziariPeriodo =>
  ({
    ricaviVendite: 1_000_000,
    valoreProduzione: 1_100_000,
    costiProduzione: 900_000,
    ammortamenti: 40_000,
    ebit: 200_000,
    ebitda: 240_000,
    oneriFinanziari: 30_000,
    utileEsercizio: 170_000,
    patrimonioNetto: 400_000,
    totaleDebiti: 1_500_000,
    passivoCorrente: 600_000,
    disponibilitaLiquide: 100_000,
    debitiBanche: 700_000,
    debitiFornitori: 300_000,
    debitiTributari: 100_000,
    debitiPrevidenziali: 200_000,
    altriDebiti: 200_000,
    ...p,
  }) as DatiFinanziariPeriodo;

const ind = (codice: string, valore: number, esito: IndiceCcii['esito']): IndiceCcii => ({
  codice,
  nome: `${codice} — indice`,
  valore,
  soglia: '< 0.80',
  esito,
});

const bilancio = (
  anno: number,
  indici: IndiceCcii[],
  altriIndici: IndiceCcii[] = [],
  p: Partial<DatiFinanziariPeriodo> = {}
): BilancioFotografia => ({ anno, dati: dati(p), indici, altriIndici });

describe('componiFotografia', () => {
  it('senza bilanci non inventa una fotografia, e dice perché', () => {
    const f = componiFotografia({ bilanci: [], codiciAbilitati: [] });

    expect(f.anni).toEqual([]);
    expect(f.diagnosi).toEqual([]);
    expect(f.avvertenze.join(' ')).toContain('Nessun bilancio XBRL');
  });

  it('mostra anche gli indici che stanno nella seconda lista (ROE, incidenza)', () => {
    const f = componiFotografia({
      bilanci: [bilancio(2024, [ind('C1', 1.26, 'VIOLATO')], [ind('INC-DEB', 0.75, 'VIOLATO')])],
      codiciAbilitati: ['C1', 'INC-DEB'],
    });

    expect(f.indici.map((i) => i.codice)).toEqual(['C1', 'INC-DEB']);
    expect(f.indici[1].valori).toEqual([0.75]);
  });

  it('gli indicatori del CCII non calcolabili sono dichiarati, con il motivo', () => {
    const f = componiFotografia({
      bilanci: [bilancio(2024, [ind('C1', 1.26, 'VIOLATO')])],
      codiciAbilitati: ['C1'],
    });

    const dscr = f.indicatoriDichiarati.find((i) => i.codice === 'DSCR');
    expect(dscr).toBeTruthy();
    expect(dscr?.motivoNonCalcolabile).toMatch(/rata/i);
    // Il DSCR non entra fra gli indici calcolati: non si finge un valore.
    expect(f.indici.some((i) => i.codice === 'DSCR')).toBe(false);
    expect(f.avvertenze.join(' ')).toContain('DSCR');
  });

  it('la diagnosi conta gli indici oltre soglia e la tendenza dice la direzione', () => {
    const f = componiFotografia({
      bilanci: [
        bilancio(2023, [ind('C1', 1.4, 'VIOLATO'), ind('C2', 0.04, 'VIOLATO')], [], {
          patrimonioNetto: -240_000,
        }),
        bilancio(2024, [ind('C1', 0.76, 'OK'), ind('C2', 0.05, 'VIOLATO')], [], {
          patrimonioNetto: 278_567,
        }),
      ],
      codiciAbilitati: ['C1', 'C2'],
    });

    expect(f.diagnosi.map((d) => d.indiciOltreSoglia)).toEqual([2, 1]);
    expect(f.tendenza).toContain('in riduzione');
    expect(f.tendenza).toContain('2023');
    expect(f.diagnosi[0].debitiSuRicavi).toBe(1.5);
  });

  it('con una sola annualità non finge una tendenza', () => {
    const f = componiFotografia({
      bilanci: [bilancio(2024, [ind('C1', 1.26, 'VIOLATO')])],
      codiciAbilitati: [],
    });

    expect(f.tendenza).toContain('Una sola annualità');
    expect(f.avvertenze.join(' ')).toContain('non c’è una tendenza');
  });
});

describe('assunzioni della traduzione', () => {
  it('dichiara fuori bilancio ciò che il bilancio non basta a calcolare', () => {
    const f = componiFotografia({ bilanci: [], codiciAbilitati: [] });
    expect(f.assunzioni.length).toBeGreaterThan(5);
    const dscr = f.assunzioni.find((a) => a.voce.includes('DSCR'))!;
    expect(dscr.origine).toBe('FUORI_BILANCIO');
    expect(dscr.assunzione).toContain('n/d');
  });

  it('dichiara che i fact assenti non si stimano, e la riserva sul valore della produzione', () => {
    const f = componiFotografia({ bilanci: [], codiciAbilitati: [] });
    expect(f.assunzioni.find((a) => a.voce === 'Fact assenti')?.assunzione).toContain(
      'Non si stimano'
    );
    const vp = f.assunzioni.find((a) => a.voce === 'Valore della produzione')!;
    expect(vp.origine).toBe('RISERVA');
    expect(vp.assunzione).toContain('ricavi delle vendite');
  });

  it('la nota integrativa resta contesto e non diventa un tasso', () => {
    const nota = componiFotografia({ bilanci: [], codiciAbilitati: [] }).assunzioni.find((a) =>
      a.voce.includes('Nota integrativa')
    )!;
    expect(nota.assunzione).toContain('non si converte');
  });
});
