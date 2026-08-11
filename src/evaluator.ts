import { XbrlFinancialData, AtecoCategory, EvaluationResult } from './types';
import { SECTOR_THRESHOLDS } from './thresholds';

export function evaluateCndcec(data: XbrlFinancialData, settore: AtecoCategory): EvaluationResult {
  // Rettifica Patrimonio Netto
  const pnRettificato =
    data.patrimonioNetto - data.creditiSociNonVersati - data.dividendiDeliberatiNonContabilizzati;

  // STEP 1: Verifica Patrimonio Netto Rettificato
  if (pnRettificato < 0) {
    return {
      statoAllerta: true,
      motivo: 'Patrimonio Netto Rettificato negativo (PN < 0).',
      dettaglioIndici: {
        patrimonioNettoRettificato: pnRettificato,
        oneriFinanziariSuRicavi: 0,
        patrimonioNettoSuDebiti: 0,
        liquiditaBreve: 0,
        cashFlowSuAttivo: 0,
        indebitamentoPrevTribSuAttivo: 0,
      },
    };
  }

  // Eccezioni di applicabilità indici di settore
  if (data.anniOperativita < 2 || data.inLiquidazione || data.isStartupInnovativa) {
    return {
      statoAllerta: false,
      motivo:
        'Patrimonio netto positivo. Indici di settore non applicabili per categoria speciale/società recente.',
      dettaglioIndici: { patrimonioNettoRettificato: pnRettificato } as any,
    };
  }

  // STEP 2: Calcolo dei 5 Indici CNDCEC
  const ricaviTotali = data.ricaviVendite + data.variazioneLavoriCorso;
  const debitiTotaliConRatei = data.totaleDebiti + data.rateiRiscontiPassivi;

  const oneriFinSuRicavi = ricaviTotali > 0 ? data.oneriFinanziari / ricaviTotali : 0;
  const pnSuDebiti = debitiTotaliConRatei > 0 ? pnRettificato / debitiTotaliConRatei : 0;

  const attivoBreve = data.attivoCircolanteBreve + data.rateiRiscontiAttivi;
  const passivoBreve = data.debitiBreve + data.rateiRiscontiPassivi;
  const liquiditaBreve = passivoBreve > 0 ? attivoBreve / passivoBreve : 0;

  const cashFlowApprossimato = data.utileEsercizio + data.ammortamentiSvalutazioniAccantonamenti;
  const cashFlowSuAttivo = data.totaleAttivo > 0 ? cashFlowApprossimato / data.totaleAttivo : 0;

  const debTributariEPrev = data.debitiTributari + data.debitiPrevidenziali;
  const indebPrevTribSuAttivo = data.totaleAttivo > 0 ? debTributariEPrev / data.totaleAttivo : 0;

  // STEP 3: Confronto con Soglie Settoriali
  const thresholds = SECTOR_THRESHOLDS[settore];

  const violazioni = {
    oneriFinanziariSuRicavi: oneriFinSuRicavi >= thresholds.oneriFinanziariSuRicaviMax,
    patrimonioNettoSuDebiti: pnSuDebiti <= thresholds.patrimonioNettoSuDebitiMin,
    liquiditaBreve: liquiditaBreve <= thresholds.liquiditaBreveMin,
    cashFlowSuAttivo: cashFlowSuAttivo <= thresholds.cashFlowSuAttivoMin,
    indebitamentoPrevTribSuAttivo:
      indebPrevTribSuAttivo >= thresholds.indebitamentoPrevTribSuAttivoMax,
  };

  // Regola di congiunzione: Allerta SOLO se TUTTI e 5 gli indici superano la soglia critica
  const allertaRilevata = Object.values(violazioni).every((v) => v === true);

  return {
    statoAllerta: allertaRilevata,
    motivo: allertaRilevata
      ? 'Allerta rilevata: superate le soglie critiche per TUTTI e 5 gli indici di settore.'
      : 'Nessuna allerta: gli indici di settore non risultano tutti contemporaneamente negativi.',
    dettaglioIndici: {
      patrimonioNettoRettificato: pnRettificato,
      oneriFinanziariSuRicavi: oneriFinSuRicavi,
      patrimonioNettoSuDebiti: pnSuDebiti,
      liquiditaBreve: liquiditaBreve,
      cashFlowSuAttivo: cashFlowSuAttivo,
      indebitamentoPrevTribSuAttivo: indebPrevTribSuAttivo,
    },
    violazioniSoglia: violazioni,
  };
}
