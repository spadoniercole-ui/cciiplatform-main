// src/lib/checklist/scoringDirettrici.ts
//
// Punteggio della Check List generata dallo Screening — pesi non fissi
// per categoria (Strutturale/Rilevante/Documentale, come la
// Ministeriale), ma calcolati dinamicamente dalla struttura delle
// direttrici configurate: quante direttrici, quanti prodotti per
// ciascuna, quante domande genera lo Screening per ciascuna sezione.
//
// Formula: ogni prodotto (sommato sulle direttrici che contribuiscono,
// vedi calcolaPesiDirettrici) vale 100/totaleProdotti punti. Il peso di una direttrice è (i suoi
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

export interface PesoDirettrice {
  nome: string;
  prodotti: number;
  peso: number;
  /** Sezione generata oltre il numero di direttrici configurate: non ha
   * una direttrice da cui prendere il peso, quindi è esclusa dal calcolo
   * (peso 0 per tutte le sue domande). */
  senzaDirettrice?: true;
  /** Sezione abbinata a una direttrice ma senza domande: non contribuisce
   * al punteggio e il peso della direttrice viene ridistribuito sulle altre. */
  senzaDomande?: true;
}

export interface QuadroDirettrici {
  pesiPerDomanda: Record<string, number>;
  /** Peso di ciascuna direttrice, per mostrare il calcolo in trasparenza. */
  pesiPerDirettrice: PesoDirettrice[];
  punteggio: number | null; // null = nessuna domanda con peso ancora risposta
  domandeRisposte: number;
  domandeTotali: number;
  etichetta: string;
  coloreEtichetta: 'verde' | 'giallo' | 'rosso' | 'grigio';
}

/** Calcola il peso di ciascuna domanda dalla struttura delle direttrici
 * — indipendente dalle risposte, serve anche solo per mostrare "come
 * pesa ciascuna direttrice" prima ancora di rispondere a nulla.
 *
 * Regola di normalizzazione: i 100 punti si ripartiscono SOLO tra le
 * direttrici che contribuiscono davvero, cioè quelle abbinate (per
 * posizione) a una sezione con almeno una domanda. Quindi:
 * - una direttrice senza sezione generata (meno sezioni che direttrici)
 *   esce dal denominatore;
 * - una sezione senza domande ha peso 0 (flag `senzaDomande`) e il peso
 *   della sua direttrice si ridistribuisce sulle altre;
 * - una sezione in più rispetto alle direttrici ha peso 0 (flag
 *   `senzaDirettrice`): non ha prodotti da cui ricavare un peso.
 * Così la somma dei pesi delle domande è sempre 100 (se almeno una
 * domanda ha peso). Eccezione: se NESSUNA sezione ha domande (anteprima
 * della sola struttura, es. pagina Pesi direttrici) i pesi per direttrice
 * si calcolano su tutte le sezioni abbinate, come prima. */
export function calcolaPesiDirettrici(
  sezioni: SezioneChecklist[],
  direttrici: DirettriceStrutturata[]
): {
  pesiPerDomanda: Record<string, number>;
  pesiPerDirettrice: PesoDirettrice[];
} {
  const totaleProdotti = direttrici.reduce((acc, d) => acc + d.prodotti.length, 0);
  const pesiPerDomanda: Record<string, number> = {};
  const pesiPerDirettrice: PesoDirettrice[] = [];

  if (totaleProdotti === 0) {
    return { pesiPerDomanda, pesiPerDirettrice };
  }

  const soloAnteprima = sezioni.every((s) => s.domande.length === 0);
  const contribuisce = (sezione: SezioneChecklist, indice: number) =>
    indice < direttrici.length && (soloAnteprima || sezione.domande.length > 0);
  const prodottiContribuenti = sezioni.reduce(
    (acc, sezione, indice) =>
      contribuisce(sezione, indice) ? acc + direttrici[indice].prodotti.length : acc,
    0
  );
  const valorePerProdotto = prodottiContribuenti > 0 ? 100 / prodottiContribuenti : 0;

  sezioni.forEach((sezione, indice) => {
    const direttrice = direttrici[indice];
    const numeroProdotti = direttrice?.prodotti.length ?? 0;
    const pesoDirettrice = contribuisce(sezione, indice) ? numeroProdotti * valorePerProdotto : 0;
    const voce: PesoDirettrice = {
      nome: direttrice?.nome ?? sezione.titolo,
      prodotti: numeroProdotti,
      peso: pesoDirettrice,
    };
    if (!direttrice) voce.senzaDirettrice = true;
    else if (sezione.domande.length === 0 && !soloAnteprima) voce.senzaDomande = true;
    pesiPerDirettrice.push(voce);
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
  if (punteggio <= 0)
    return { etichetta: 'Nessuna criticità netta rilevata', coloreEtichetta: 'verde' };
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
  // Risposte date a domande con peso > 0: se sono tutte su domande a peso 0
  // (es. sezioni senza direttrice) il punteggio non è valutabile (grigio),
  // non "0 = nessuna criticità".
  let rispostePesate = 0;

  for (const sezione of sezioni) {
    for (const domanda of sezione.domande) {
      domandeTotali++;
      const risposta = risposte[domanda.id]?.risposta;
      if (risposta === null || risposta === undefined) continue;
      domandeRisposte++;
      const peso = pesiPerDomanda[domanda.id] ?? 0;
      if (peso > 0) rispostePesate++;
      punteggio += risposta === false ? peso : -peso;
    }
  }

  const punteggioFinale = rispostePesate > 0 ? punteggio : null;
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
