import { describe, it, expect } from 'vitest';
import {
  calcolaPiano,
  rateDaProposta,
  aliquotaImplicita,
  type EsercizioStorico,
  type IpotesiPiano,
} from './piano';

const S: EsercizioStorico = {
  anno: 2025,
  ricaviVendite: 1_016_000,
  valoreProduzione: 1_016_000,
  costiProduzione: 1_022_683,
  ammortamenti: 0,
  oneriFinanziari: 0,
  utileEsercizio: -6_683,
  immobilizzazioni: 131_286,
  creditiClienti: 0,
  disponibilitaLiquide: 364_958,
  attivoCircolante: 1_549_158,
  totaleAttivo: 1_680_673,
  patrimonioNetto: -504_146,
  debitiBanche: 0,
  debitiFornitori: 0,
  debitiTributari: 0,
  debitiPrevidenziali: 14_914,
  totaleDebiti: 2_029_450,
};

describe('piano di sviluppo', () => {
  it('senza ipotesi il piano ripete lo storico e rileva la perdita e il patrimonio negativo', () => {
    const e = calcolaPiano(S, 5, {}, { ente: [0, 0, 0, 0, 0], altri: [0, 0, 0, 0, 0] });
    expect(e.anni).toHaveLength(5);
    expect(e.anni[0].ricaviVendite).toBe(1_016_000);
    expect(e.anni[0].ebitda).toBe(-6_683);
    expect(e.vincoli.some((v) => v.codice === 'PERDITA')).toBe(true);
    expect(e.vincoli.some((v) => v.codice === 'PATRIMONIO_NEGATIVO')).toBe(true);
    expect(e.annoPatrimonioPositivo).toBeNull();
  });
  it('ipotesi in percentuale e in valore assoluto; rate coperte e cassa che scende', () => {
    const e = calcolaPiano(
      S,
      3,
      {
        ricaviVendite: [{ tipo: 'pct', valore: 10 }, { tipo: 'pct', valore: 5 }, null],
        costiOperativi: [{ tipo: 'abs', valore: 900_000 }, { tipo: 'pct', valore: 2 }, null],
      },
      { ente: [5_000, 5_000, 4_914], altri: [100_000, 100_000, 100_000] }
    );
    expect(e.anni[0].ricaviVendite).toBe(1_117_600);
    expect(e.anni[0].costiOperativi).toBe(900_000);
    expect(e.anni[0].ebitda).toBe(217_600);
    expect(e.anni[0].coperturaRate).toBeGreaterThan(1);
    expect(e.anni[0].debitiPrevidenziali).toBe(9_914);
    expect(e.anni[2].debitiPrevidenziali).toBe(0);
    expect(e.anni[0].disponibilitaLiquide).toBeLessThan(S.disponibilitaLiquide + 217_600);
  });
  it('è deterministico', () => {
    const ip: IpotesiPiano = { ricaviVendite: [{ tipo: 'pct', valore: 3 }] };
    const rate = { ente: [1000], altri: [] };
    expect(calcolaPiano(S, 5, ip, rate)).toEqual(calcolaPiano(S, 5, ip, rate));
  });
  it('le rate dalla proposta si distribuiscono per anno, ente separato dagli altri', () => {
    const r = rateDaProposta(
      [
        {
          categoriaCreditore: 'INPS',
          importoDovuto: 120_000,
          percentualeOfferta: 50,
          numeroRate: 24,
          modalita: 'RATEALE',
        },
        {
          categoriaCreditore: 'Banca',
          importoDovuto: 400_000,
          percentualeOfferta: 100,
          numeroRate: null,
          modalita: 'UNICA',
        },
      ],
      3,
      (c) => c === 'INPS'
    );
    expect(r.ente).toEqual([30_000, 30_000, 0]);
    expect(r.altri).toEqual([400_000, 0, 0]);
  });
  it('aliquota implicita dallo storico solo se ricavabile', () => {
    expect(aliquotaImplicita(S)).toBeNull();
    expect(aliquotaImplicita({ ...S, costiProduzione: 900_000, utileEsercizio: 84_000 })).toBe(
      27.59
    );
  });
});
