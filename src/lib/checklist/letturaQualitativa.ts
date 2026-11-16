// IL QUADRO QUALITATIVO DELLA CHECK LIST, IN UN POSTO SOLO (0.242.1).
//
// La regola dei due terzi e la valutazione pesata convivono in
// `pesoProdotti.ts`, ma la DECISIONE su quando il quadro entra nella
// valutazione — solo a check list completa — viveva in due punti: l'azione che
// compone l'indicatore e la pagina della Posizione. Due copie della stessa
// regola divergono sempre, prima o poi: la pagina mostrava il quadro anche su
// una check list a metà, l'indicatore no.
//
// Qui c'è la lettura unica, sulla falsariga di `letturaVerifica.ts`: una
// funzione che legge (check list + percentuale pesata) e una pura che compone.
// Chi ha bisogno del quadro qualitativo passa di qui e non ricalcola niente.

import {
  checklistProdottiCompleta,
  coloreQualitativoSommario,
  dettaglioOrientamentoSommario,
} from './pesoProdotti';
import { leggiPercentualeCriticitaPesata } from './pesataMinisteriale';
import { leggiChecklistProdottiAzienda } from '@/lib/prodotti/checklistAzienda';
import type { SintesiChecklistProdotti } from '@/lib/prodotti/prodotti';

export type ColoreQualitativo = 'verde' | 'giallo' | 'rosso';

export interface LetturaQualitativa {
  /** La sintesi letta, restituita perché chi chiama non la rilegga per conto suo. */
  sintesi: SintesiChecklistProdotti | null;
  colore: ColoreQualitativo | null;
  dettaglio: string | null;
  completa: boolean;
  percentualePesata: number | null;
  /** Perché il quadro resta fuori dalla valutazione; null quando c'è ed è leggibile. */
  motivo: string | null;
}

/**
 * Compone la lettura da ciò che è già stato letto. Il quadro pesa solo se la
 * check list dei prodotti è completa: un quadro su tre domande su venti non è
 * una lettura parziale da attribuire a un caso non qualificato. In quel caso la
 * dimensione resta scoperta — la copertura lo dichiara — e non peggiora nulla.
 */
export function componiLetturaQualitativa(
  sintesi: SintesiChecklistProdotti | null,
  percentualePesata: number | null
): LetturaQualitativa {
  if (!sintesi) {
    return {
      sintesi: null,
      colore: null,
      dettaglio: null,
      completa: false,
      percentualePesata,
      motivo: 'La check list dei prodotti non è leggibile.',
    };
  }

  if (sintesi.totale === 0) {
    return {
      sintesi,
      colore: null,
      dettaglio: null,
      completa: false,
      percentualePesata,
      motivo:
        'Nessun prodotto è in check list: non ci sono domande da porre, e il quadro resta fuori dalla valutazione.',
    };
  }

  if (!checklistProdottiCompleta(sintesi)) {
    return {
      sintesi,
      colore: null,
      dettaglio: null,
      completa: false,
      percentualePesata,
      motivo: `La check list dei prodotti non è completa (${sintesi.risposte}/${sintesi.totale} risposte): il quadro resta fuori dalla valutazione finché non lo è.`,
    };
  }

  const colore = coloreQualitativoSommario({
    qualificazione: sintesi.qualificazione,
    percentualeCriticitaPesata: percentualePesata,
  });

  if (colore === null) {
    return {
      sintesi,
      colore: null,
      dettaglio: dettaglioOrientamentoSommario(sintesi, percentualePesata),
      completa: true,
      percentualePesata,
      motivo:
        'La check list non ha domande chiuse con risposta: il quadro qualitativo non è valutabile.',
    };
  }

  return {
    sintesi,
    colore,
    dettaglio: dettaglioOrientamentoSommario(sintesi, percentualePesata),
    completa: true,
    percentualePesata,
    motivo: null,
  };
}

/**
 * La lettura per un'azienda: check list dei prodotti e percentuale pesata della
 * Check List, lette una volta. Nessuna delle due letture è un accertamento:
 * sono ciò che l'azienda dichiara e ciò che l'operatore ha osservato.
 */
export async function leggiQualitativaAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<LetturaQualitativa> {
  const [sintesi, percentualePesata] = await Promise.all([
    leggiChecklistProdottiAzienda(nomeSchema, aziendaId).catch(() => null),
    leggiPercentualeCriticitaPesata(nomeSchema, aziendaId),
  ]);
  return componiLetturaQualitativa(sintesi, percentualePesata);
}
