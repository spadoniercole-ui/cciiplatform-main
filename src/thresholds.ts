import { AtecoCategory, SectorThresholds } from './types';

export const SECTOR_THRESHOLDS: Record<AtecoCategory, SectorThresholds> = {
  AGRICOLTURA: {
    oneriFinanziariSuRicaviMax: 0.028,
    patrimonioNettoSuDebitiMin: 0.094,
    liquiditaBreveMin: 0.921,
    cashFlowSuAttivoMin: 0.003,
    indebitamentoPrevTribSuAttivoMax: 0.056,
  },
  MANIFATTURA: {
    oneriFinanziariSuRicaviMax: 0.03,
    patrimonioNettoSuDebitiMin: 0.076,
    liquiditaBreveMin: 0.937,
    cashFlowSuAttivoMin: 0.005,
    indebitamentoPrevTribSuAttivoMax: 0.049,
  },
  COSTRUZIONI_EDIFICI: {
    oneriFinanziariSuRicaviMax: 0.038,
    patrimonioNettoSuDebitiMin: 0.049,
    liquiditaBreveMin: 1.08,
    cashFlowSuAttivoMin: 0.004,
    indebitamentoPrevTribSuAttivoMax: 0.038,
  },
  COSTRUZIONI_SPECIALIZZATE: {
    oneriFinanziariSuRicaviMax: 0.028,
    patrimonioNettoSuDebitiMin: 0.053,
    liquiditaBreveMin: 1.011,
    cashFlowSuAttivoMin: 0.014,
    indebitamentoPrevTribSuAttivoMax: 0.053,
  },
  COMMERCIO_INGROSSO: {
    oneriFinanziariSuRicaviMax: 0.021,
    patrimonioNettoSuDebitiMin: 0.063,
    liquiditaBreveMin: 1.014,
    cashFlowSuAttivoMin: 0.006,
    indebitamentoPrevTribSuAttivoMax: 0.029,
  },
  COMMERCIO_DETTAGLIO_RISTORAZIONE: {
    oneriFinanziariSuRicaviMax: 0.015,
    patrimonioNettoSuDebitiMin: 0.042,
    liquiditaBreveMin: 0.898,
    cashFlowSuAttivoMin: 0.01,
    indebitamentoPrevTribSuAttivoMax: 0.078,
  },
  TRASPORTI_HOTEL: {
    oneriFinanziariSuRicaviMax: 0.015,
    patrimonioNettoSuDebitiMin: 0.041,
    liquiditaBreveMin: 0.86,
    cashFlowSuAttivoMin: 0.014,
    indebitamentoPrevTribSuAttivoMax: 0.102,
  },
  SERVIZI_IMPRESE: {
    oneriFinanziariSuRicaviMax: 0.018,
    patrimonioNettoSuDebitiMin: 0.052,
    liquiditaBreveMin: 0.954,
    cashFlowSuAttivoMin: 0.017,
    indebitamentoPrevTribSuAttivoMax: 0.119,
  },
  SERVIZI_PERSONE: {
    oneriFinanziariSuRicaviMax: 0.027,
    patrimonioNettoSuDebitiMin: 0.023,
    liquiditaBreveMin: 0.698,
    cashFlowSuAttivoMin: 0.005,
    indebitamentoPrevTribSuAttivoMax: 0.146,
  },
};
