import { XBRL_TAGS } from './Constants';
import { DIZIONARIO_ANAGRAFICA, DIZIONARIO_INDICI_MASTER } from '@/lib/Constants';

export const getFinancialData = (data: Record<string, number>, year: 'c0' | 'c1') => {
  const get = (tag: string) => data[`${tag}:${year}_i`] || data[`${tag}:${year}_d`] || 0;

  const v_prod = get(XBRL_TAGS.RICAVI) + get(XBRL_TAGS.VAR_RIMANENZE) + get(XBRL_TAGS.ALTRI_RICAVI);
  const costi_esterni =
    get(XBRL_TAGS.COSTI_MATERIE) +
    get(XBRL_TAGS.COSTI_SERVIZI) +
    get(XBRL_TAGS.COSTI_GODIMENTO_TERZI);

  return {
    valoreAggiunto: {
      ValoreProduzione: v_prod,
      ValoreAggiunto: v_prod - costi_esterni,
      MOL: v_prod - costi_esterni - get(XBRL_TAGS.COSTI_PERSONALE),
    },
    statoPatrimoniale: {
      CapitaleFisso: get(XBRL_TAGS.IMMOBILIZZAZIONI_NETTE),
      CCN: get(XBRL_TAGS.ATTIVO_CIRCOLANTE) - get(XBRL_TAGS.PASSIVO_CORRENTE),
    },
  };
};
