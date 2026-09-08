// src/lib/xbrl/trend.ts
//
// Confronta l'analisi corrente con lo storico salvato della stessa azienda
// (tabella analisi_xbrl_storico) e segnala i peggioramenti: un indice che
// era OK ed è diventato VIOLATO, la severity complessiva che peggiora, la
// PFN che cresce. Usato dalla tab "Andamento Storico" e, quando presente,
// dalla Relazione AI per un giudizio che tenga conto della traiettoria
// dell'azienda e non solo della fotografia dell'ultimo bilancio.

import type { IndiceCcii, AlertSeverity, SituazioneDebitoria } from './types';

export interface PuntoStorico {
  anno: number | null;
  indici: IndiceCcii[];
  severity: AlertSeverity;
  situazioneDebitoria: SituazioneDebitoria;
}

export interface AndamentoIndice {
  codice: string;
  nome: string;
  /** Valori nell'ordine cronologico fornito in input (storico + corrente in coda). */
  serie: { anno: number | null; valore: number | 'N/D'; esito: IndiceCcii['esito'] }[];
  /** true se l'ultimo valore è peggiore del penultimo (OK/NON_CALCOLABILE -> VIOLATO). */
  peggioratoUltimoPeriodo: boolean;
}

export type DirezioneTrend = 'MIGLIORAMENTO' | 'STABILE' | 'PEGGIORAMENTO';

export interface RisultatoTrend {
  andamentoIndici: AndamentoIndice[];
  andamentoPfn: { anno: number | null; valore: number }[];
  direzioneSeverity: DirezioneTrend;
  segnalazioni: string[];
}

const ORDINE_SEVERITY: Record<AlertSeverity, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

/**
 * Calcola l'andamento storico. `storico` deve essere già ordinato
 * cronologicamente (anno crescente); `corrente` è l'analisi in corso,
 * sempre messa in coda alla serie.
 */
export function calcolaTrend(storico: PuntoStorico[], corrente: PuntoStorico): RisultatoTrend {
  const serieCompleta = [...storico, corrente];
  const segnalazioni: string[] = [];

  // Tutti i codici indice visti in almeno un punto della serie (gestisce il
  // caso in cui un'azienda cambi taxonomy/nuovi indici compaiano nel tempo).
  const codiciIndici = new Map<string, string>(); // codice -> nome
  serieCompleta.forEach((punto) => {
    punto.indici.forEach((i) => codiciIndici.set(i.codice, i.nome));
  });

  const andamentoIndici: AndamentoIndice[] = Array.from(codiciIndici.entries()).map(
    ([codice, nome]) => {
      const serie = serieCompleta.map((punto) => {
        const ind = punto.indici.find((i) => i.codice === codice);
        return {
          anno: punto.anno,
          valore: ind ? ind.valore : ('N/D' as const),
          esito: ind ? ind.esito : ('NON_CALCOLABILE' as const),
        };
      });

      const ultimo = serie[serie.length - 1];
      const penultimo = serie.length >= 2 ? serie[serie.length - 2] : null;
      const peggioratoUltimoPeriodo =
        !!penultimo && penultimo.esito !== 'VIOLATO' && ultimo.esito === 'VIOLATO';

      if (peggioratoUltimoPeriodo) {
        segnalazioni.push(
          `L'indice ${codice} (${nome}) è passato da "${penultimo!.esito}" a "VIOLATO" nell'ultimo periodo analizzato.`
        );
      }

      return { codice, nome, serie, peggioratoUltimoPeriodo };
    }
  );

  const andamentoPfn = serieCompleta.map((punto) => ({
    anno: punto.anno,
    valore: punto.situazioneDebitoria.pfn,
  }));

  if (andamentoPfn.length >= 2) {
    const ultimaPfn = andamentoPfn[andamentoPfn.length - 1].valore;
    const penultimaPfn = andamentoPfn[andamentoPfn.length - 2].valore;
    if (ultimaPfn > penultimaPfn) {
      const incremento = ultimaPfn - penultimaPfn;
      segnalazioni.push(
        `La Posizione Finanziaria Netta è peggiorata di € ${incremento.toLocaleString('it-IT')} rispetto al periodo precedente.`
      );
    }
  }

  let direzioneSeverity: DirezioneTrend = 'STABILE';
  if (storico.length > 0) {
    const severityPrecedente = ORDINE_SEVERITY[storico[storico.length - 1].severity];
    const severityCorrente = ORDINE_SEVERITY[corrente.severity];
    if (severityCorrente > severityPrecedente) direzioneSeverity = 'PEGGIORAMENTO';
    else if (severityCorrente < severityPrecedente) direzioneSeverity = 'MIGLIORAMENTO';
  }

  return { andamentoIndici, andamentoPfn, direzioneSeverity, segnalazioni };
}
