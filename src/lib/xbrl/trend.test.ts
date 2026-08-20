import { describe, it, expect } from 'vitest';
import { calcolaTrend, type PuntoStorico } from './trend';
import type { IndiceCcii, SituazioneDebitoria } from './types';

function indice(
  codice: string,
  esito: IndiceCcii['esito'],
  valore: number | 'N/D' = 0
): IndiceCcii {
  return { codice, nome: `Indice ${codice}`, valore, soglia: '< 0.80', esito };
}

function debitoria(pfn: number): SituazioneDebitoria {
  return {
    debitiBanche: 0,
    debitiFornitori: 0,
    debitiTributari: 0,
    debitiPrevidenziali: 0,
    altriDebiti: 0,
    totaleDebiti: 0,
    disponibilitaLiquide: 0,
    pfn,
  };
}

describe('calcolaTrend', () => {
  it('segnala un indice che passa da OK a VIOLATO', () => {
    const storico: PuntoStorico[] = [
      {
        anno: 2023,
        indici: [indice('C1', 'OK', 0.5)],
        severity: 'GREEN',
        situazioneDebitoria: debitoria(100),
      },
    ];
    const corrente: PuntoStorico = {
      anno: 2024,
      indici: [indice('C1', 'VIOLATO', 0.9)],
      severity: 'YELLOW',
      situazioneDebitoria: debitoria(100),
    };

    const trend = calcolaTrend(storico, corrente);
    const c1 = trend.andamentoIndici.find((i) => i.codice === 'C1')!;

    expect(c1.peggioratoUltimoPeriodo).toBe(true);
    expect(trend.segnalazioni.some((s) => s.includes('C1'))).toBe(true);
  });

  it("non segnala nulla se l'indice resta OK", () => {
    const storico: PuntoStorico[] = [
      {
        anno: 2023,
        indici: [indice('C1', 'OK', 0.3)],
        severity: 'GREEN',
        situazioneDebitoria: debitoria(50),
      },
    ];
    const corrente: PuntoStorico = {
      anno: 2024,
      indici: [indice('C1', 'OK', 0.35)],
      severity: 'GREEN',
      situazioneDebitoria: debitoria(50),
    };

    const trend = calcolaTrend(storico, corrente);
    const c1 = trend.andamentoIndici.find((i) => i.codice === 'C1')!;

    expect(c1.peggioratoUltimoPeriodo).toBe(false);
    expect(trend.segnalazioni.length).toBe(0);
    expect(trend.direzioneSeverity).toBe('STABILE');
  });

  it('rileva la PFN in peggioramento', () => {
    const storico: PuntoStorico[] = [
      { anno: 2023, indici: [], severity: 'GREEN', situazioneDebitoria: debitoria(100) },
    ];
    const corrente: PuntoStorico = {
      anno: 2024,
      indici: [],
      severity: 'GREEN',
      situazioneDebitoria: debitoria(300),
    };

    const trend = calcolaTrend(storico, corrente);
    expect(trend.segnalazioni.some((s) => s.includes('Posizione Finanziaria Netta'))).toBe(true);
  });

  it('rileva la direzione della severity complessiva: PEGGIORAMENTO', () => {
    const storico: PuntoStorico[] = [
      { anno: 2023, indici: [], severity: 'GREEN', situazioneDebitoria: debitoria(0) },
    ];
    const corrente: PuntoStorico = {
      anno: 2024,
      indici: [],
      severity: 'RED',
      situazioneDebitoria: debitoria(0),
    };

    expect(calcolaTrend(storico, corrente).direzioneSeverity).toBe('PEGGIORAMENTO');
  });

  it('rileva la direzione della severity complessiva: MIGLIORAMENTO', () => {
    const storico: PuntoStorico[] = [
      { anno: 2023, indici: [], severity: 'RED', situazioneDebitoria: debitoria(0) },
    ];
    const corrente: PuntoStorico = {
      anno: 2024,
      indici: [],
      severity: 'GREEN',
      situazioneDebitoria: debitoria(0),
    };

    expect(calcolaTrend(storico, corrente).direzioneSeverity).toBe('MIGLIORAMENTO');
  });

  it('senza storico pregresso, la direzione è STABILE per definizione (nulla da confrontare)', () => {
    const corrente: PuntoStorico = {
      anno: 2024,
      indici: [],
      severity: 'RED',
      situazioneDebitoria: debitoria(0),
    };
    expect(calcolaTrend([], corrente).direzioneSeverity).toBe('STABILE');
  });
});
