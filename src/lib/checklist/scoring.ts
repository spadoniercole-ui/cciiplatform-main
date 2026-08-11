// src/lib/checklist/scoring.ts
//
// Calcolo del quadro qualitativo pesato della Check List. Il punteggio
// considera SOLO le domande già risposte (Sì o No): quelle non ancora
// valutate non contano né a favore né contro, per non mostrare un quadro
// falsamente positivo su uno scenario ancora in compilazione.
//
// Soglie di sintesi (0-100% di criticità pesata) scelte da Claude come
// default ragionevole, NON normativa: vanno riviste insieme, come i pesi
// stessi.

import { PESO_NUMERICO, type SezioneChecklist, type PesoDomanda } from './ministeriale';

export interface RispostaPerCalcolo {
  domandaId: string;
  risposta: boolean | null;
}

export interface QuadroSezione {
  numero: string;
  titolo: string;
  domandeRisposte: number;
  domandeTotali: number;
  puntiCriticita: number;
  puntiMassimi: number;
  percentualeCriticita: number | null; // null = nessuna domanda ancora risposta
  criticitaStrutturaliAperte: { id: string; domanda: string }[];
}

export interface QuadroQualitativo {
  sezioni: QuadroSezione[];
  percentualeCriticitaComplessiva: number | null;
  etichetta: string;
  coloreEtichetta: 'verde' | 'giallo' | 'rosso' | 'grigio';
  criticitaStrutturaliAperte: { sezione: string; id: string; domanda: string }[];
}

function etichettaDaCriticita(
  percentuale: number | null,
  soglie: { solido: number; daRafforzare: number }
): {
  etichetta: string;
  colore: 'verde' | 'giallo' | 'rosso' | 'grigio';
} {
  if (percentuale === null) return { etichetta: 'Non ancora valutabile', colore: 'grigio' };
  if (percentuale === 0) return { etichetta: 'Nessuna criticità rilevata', colore: 'verde' };
  if (percentuale <= soglie.solido)
    return { etichetta: 'Piano solido, alcune aree di attenzione', colore: 'verde' };
  if (percentuale <= soglie.daRafforzare)
    return { etichetta: 'Piano da rafforzare su più punti', colore: 'giallo' };
  return { etichetta: 'Criticità strutturali rilevanti', colore: 'rosso' };
}

export function calcolaQuadroQualitativo(
  sezioniChecklist: SezioneChecklist[],
  risposte: Record<string, RispostaPerCalcolo>,
  pesiNumerici: Record<PesoDomanda, number> = PESO_NUMERICO,
  soglie: { solido: number; daRafforzare: number } = { solido: 20, daRafforzare: 50 }
): QuadroQualitativo {
  const quadriSezione: QuadroSezione[] = [];
  const criticitaStrutturaliAperte: { sezione: string; id: string; domanda: string }[] = [];

  let puntiCriticitaTotali = 0;
  let puntiMassimiTotali = 0;

  for (const sezione of sezioniChecklist) {
    let puntiCriticita = 0;
    let puntiMassimi = 0;
    let domandeRisposte = 0;
    const strutturaliAperte: { id: string; domanda: string }[] = [];

    for (const domanda of sezione.domande) {
      const risposta = risposte[domanda.id]?.risposta;
      if (risposta === null || risposta === undefined) continue;

      domandeRisposte++;
      const peso = pesiNumerici[domanda.peso as PesoDomanda];
      puntiMassimi += peso;

      if (risposta === false) {
        puntiCriticita += peso;
        if (domanda.peso === 'STRUTTURALE') {
          strutturaliAperte.push({ id: domanda.id, domanda: domanda.domanda });
          criticitaStrutturaliAperte.push({
            sezione: `${sezione.numero}. ${sezione.titolo}`,
            id: domanda.id,
            domanda: domanda.domanda,
          });
        }
      }
    }

    quadriSezione.push({
      numero: sezione.numero,
      titolo: sezione.titolo,
      domandeRisposte,
      domandeTotali: sezione.domande.length,
      puntiCriticita,
      puntiMassimi,
      percentualeCriticita:
        puntiMassimi > 0 ? Math.round((puntiCriticita / puntiMassimi) * 100) : null,
      criticitaStrutturaliAperte: strutturaliAperte,
    });

    puntiCriticitaTotali += puntiCriticita;
    puntiMassimiTotali += puntiMassimi;
  }

  const percentualeComplessiva =
    puntiMassimiTotali > 0 ? Math.round((puntiCriticitaTotali / puntiMassimiTotali) * 100) : null;
  const { etichetta, colore } = etichettaDaCriticita(percentualeComplessiva, soglie);

  return {
    sezioni: quadriSezione,
    percentualeCriticitaComplessiva: percentualeComplessiva,
    etichetta,
    coloreEtichetta: colore,
    criticitaStrutturaliAperte,
  };
}
