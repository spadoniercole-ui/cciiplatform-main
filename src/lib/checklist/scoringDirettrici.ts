// src/lib/checklist/scoringDirettrici.ts
//
// Punteggio della Check List generata dallo Screening — pesi non fissi
// per categoria (Strutturale/Rilevante/Documentale, come la
// Ministeriale), ma calcolati dinamicamente dalla struttura delle
// direttrici configurate: quante direttrici, quanti prodotti per
// ciascuna, quante domande genera lo Screening per ciascuna sezione.
//
// Formula: ogni prodotto (sommato su tutte le direttrici) vale
// 100/totaleProdotti punti. Il peso di una direttrice è (i suoi
// prodotti) × quel valore. Il peso di una singola domanda è il peso
// della sua direttrice diviso per il numero di domande che la sezione
// contiene. Il punteggio finale è la somma dei pesi delle domande con
// risposta No, meno la somma dei pesi delle domande con risposta Sì
// (il Sì presuppone una situazione favorevole, pesa a scendere).
//
// Le sezioni generate sono abbinate alle direttrici configurate per
// POSIZIONE (indice), non per nome — il prompt genera una sezione per
// direttrice nello stesso ordine in cui sono elencate, e l'AI potrebbe
// riformulare leggermente il titolo: la posizione è più affidabile di
// un confronto testuale.

import type { SezioneChecklist } from './ministeriale';
import type { RispostaPerCalcolo } from './scoring';
import type { DirettriceStrutturata } from '@/app/actions/screeningAzienda';

export interface QuadroDirettrici {
  pesiPerDomanda: Record<string, number>;
  /** Peso di ciascuna direttrice, per mostrare il calcolo in trasparenza. */
  pesiPerDirettrice: { nome: string; prodotti: number; peso: number }[];
  punteggio: number | null; // null = nessuna domanda ancora risposta
  domandeRisposte: number;
  domandeTotali: number;
  etichetta: string;
  coloreEtichetta: 'verde' | 'giallo' | 'rosso' | 'grigio';
}

/** Calcola il peso di ciascuna domanda dalla struttura delle direttrici
 * — indipendente dalle risposte, serve anche solo per mostrare "come
 * pesa ciascuna direttrice" prima ancora di rispondere a nulla. */
export function calcolaPesiDirettrici(
  sezioni: SezioneChecklist[],
  direttrici: DirettriceStrutturata[]
): {
  pesiPerDomanda: Record<string, number>;
  pesiPerDirettrice: QuadroDirettrici['pesiPerDirettrice'];
} {
  const totaleProdotti = direttrici.reduce((acc, d) => acc + d.prodotti.length, 0);
  const pesiPerDomanda: Record<string, number> = {};
  const pesiPerDirettrice: QuadroDirettrici['pesiPerDirettrice'] = [];

  if (totaleProdotti === 0) {
    return { pesiPerDomanda, pesiPerDirettrice };
  }
  const valorePerProdotto = 100 / totaleProdotti;

  sezioni.forEach((sezione, indice) => {
    const direttrice = direttrici[indice];
    const numeroProdotti = direttrice?.prodotti.length ?? 0;
    const pesoDirettrice = numeroProdotti * valorePerProdotto;
    pesiPerDirettrice.push({
      nome: direttrice?.nome ?? sezione.titolo,
      prodotti: numeroProdotti,
      peso: pesoDirettrice,
    });
    const numeroDomande = sezione.domande.length;
    if (numeroDomande === 0) return;
    const pesoPerDomanda = pesoDirettrice / numeroDomande;
    for (const domanda of sezione.domande) {
      pesiPerDomanda[domanda.id] = pesoPerDomanda;
    }
  });

  return { pesiPerDomanda, pesiPerDirettrice };
}

function etichettaDaPunteggio(punteggio: number | null): {
  etichetta: string;
  coloreEtichetta: 'verde' | 'giallo' | 'rosso' | 'grigio';
} {
  if (punteggio === null) return { etichetta: 'Non ancora valutabile', coloreEtichetta: 'grigio' };
  if (punteggio <= 0) return { etichetta: 'Quadro solido', coloreEtichetta: 'verde' };
  if (punteggio <= 30) return { etichetta: 'Da approfondire', coloreEtichetta: 'giallo' };
  return { etichetta: 'Criticità rilevanti', coloreEtichetta: 'rosso' };
}

export function calcolaQuadroDirettrici(
  sezioni: SezioneChecklist[],
  direttrici: DirettriceStrutturata[],
  risposte: Record<string, RispostaPerCalcolo>
): QuadroDirettrici {
  const { pesiPerDomanda, pesiPerDirettrice } = calcolaPesiDirettrici(sezioni, direttrici);

  let punteggio = 0;
  let domandeRisposte = 0;
  let domandeTotali = 0;

  for (const sezione of sezioni) {
    for (const domanda of sezione.domande) {
      domandeTotali++;
      const risposta = risposte[domanda.id]?.risposta;
      if (risposta === null || risposta === undefined) continue;
      domandeRisposte++;
      const peso = pesiPerDomanda[domanda.id] ?? 0;
      punteggio += risposta === false ? peso : -peso;
    }
  }

  const punteggioFinale = domandeRisposte > 0 ? punteggio : null;
  const { etichetta, coloreEtichetta } = etichettaDaPunteggio(punteggioFinale);

  return {
    pesiPerDomanda,
    pesiPerDirettrice,
    punteggio: punteggioFinale,
    domandeRisposte,
    domandeTotali,
    etichetta,
    coloreEtichetta,
  };
}
