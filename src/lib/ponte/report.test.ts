// src/lib/ponte/report.test.ts
//
// Il report non è un riassunto a parte: legge lo stesso output del motore.
// Questo test lo dimostra dall'inizio alla fine — input → calcolaPonte →
// reportPonteHtml — e fissa le due cose che il documento deve sempre dire:
// che il recupero viene dai parametri dell'ente e che il Ponte non qualifica
// la crisi.

import { describe, expect, it } from 'vitest';
import { calcolaPonte } from './motore';
import { reportPonteHtml } from './report';
import type { DatiPonte, InputPonte, PonteSalvato } from './types';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

function dati(): DatiFinanziariPeriodo {
  return {
    ricaviVendite: 1_200_000,
    valoreProduzione: 1_250_000,
    costiProduzione: 1_100_000,
    ebit: 150_000,
    ammortamenti: 50_000,
    ebitda: 200_000,
    oneriFinanziari: 20_000,
    utileEsercizio: 60_000,
    totaleAttivo: 900_000,
    attivoCircolante: 500_000,
    disponibilitaLiquide: 100_000,
    immobilizzazioni: 400_000,
    patrimonioNetto: 300_000,
    totaleDebiti: 600_000,
    debitiBanche: 200_000,
    debitiFornitori: 150_000,
    debitiTributari: 60_000,
    debitiPrevidenziali: 40_000,
    passivoCorrente: 350_000,
    creditiClienti: 200_000,
  };
}

const input: InputPonte = {
  aziendaId: 1,
  dataRiferimento: '2025-06-30',
  esercizi: [{ anno: 2024, dati: dati() }],
  debitoEnte: {
    totale: 150_000,
    contributi: 100_000,
    sanzioni: 10_000,
    creditiAgente: 40_000,
    righe: 12,
    fonte: 'certificazione dei debiti',
  },
  debitoEnteDichiaratoZero: false,
  note: [],
  visura: null,
  visuraImpronta: null,
  settore: { tasso: 0, fonte: 'nessuna', descrizione: 'Nessun dato di settore.' },
  rangoCredito: 'PRIVILEGIATO',
  parametriScenari: {
    costiProceduraPct: 10,
    ranghi: [
      { rango: 'PRIVILEGIATO', tassoLiquidazionePct: 60, cramDownPct: 40 },
      { rango: 'CHIROGRAFARIO', tassoLiquidazionePct: 20, cramDownPct: 15 },
      { rango: 'PREDEDUCIBILE', tassoLiquidazionePct: null, cramDownPct: null },
      { rango: 'POSTERGATO', tassoLiquidazionePct: null, cramDownPct: null },
    ],
  },
};

function documento(): string {
  const output = calcolaPonte(input);
  const datiPonte: DatiPonte = {
    azienda: {
      id: 1,
      ragioneSociale: 'Azienda di prova',
      codiceAteco: null,
      dataVerifica: '2025-06-30',
      verificaEsito: null,
    },
    esercizi: input.esercizi,
    note: input.note,
    visura: null,
    visuraImpronta: null,
    settore: input.settore,
    parametriScenari: input.parametriScenari ?? null,
    rangoCredito: 'PRIVILEGIATO',
    debitoEnte: input.debitoEnte,
    ponte: null,
    storico: [],
    blocchi: [],
  };
  const ponte: PonteSalvato = {
    id: 1,
    aziendaId: 1,
    dataRiferimento: '2025-06-30',
    versione: 1,
    stato: 'CALCOLATO',
    hashInput: 'x',
    hashOutput: 'y',
    output,
    assunzioni: output.assunzioni,
    copertura: output.copertura,
    avvisi: output.avvisi,
    limiti: output.limiti,
    motoreVersione: output.versioneMotore,
    noteCopertura: 0,
    createdAt: '2025-07-01T10:00:00.000Z',
    confermatoIl: null,
  };
  return reportPonteHtml({ dati: datiPonte, ponte });
}

describe('report del Piano-ponte', () => {
  it('contiene la Sintesi integrata con il credito, il debito e il recupero', () => {
    const html = documento();
    expect(html).toContain('7. Sintesi integrata');
    expect(html).toContain('Credito certo dell’ente');
    expect(html).toContain('150.000 €');
    expect(html).toContain('Liquidazione giudiziale');
    // 150.000 × 60% = 90.000; spese 10% = 9.000; netto 81.000.
    expect(html).toContain('81.000 €');
    expect(html).toContain('Cram down omologato');
    expect(html).toContain('60.000 €');
  });

  it('dichiara la provenienza delle percentuali e non qualifica la crisi', () => {
    const html = documento();
    expect(html).toContain('configurate dall’ente');
    expect(html.toLowerCase()).not.toContain('insolvenza');
    expect(html.toLowerCase()).not.toContain('cram down omologato è dovuto');
  });
});
