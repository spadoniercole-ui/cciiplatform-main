// L'ESITO DELLA VERIFICA CONTABILE — uno solo, con la sua spiegazione.
//
// Due procedure parallele producevano due giudizi sulla stessa posizione: il
// semaforo della verifica (soglie di legge, patrimonio, indici, copertura) e
// l'Indice di Attenzione Istruttoria (composito 0-100, con pesi configurabili
// e fasce). Sullo stesso fascicolo si leggeva «criticità rilevante» sopra «IAI
// 41 — da monitorare»: chi decide doveva scegliere quale dei due credere, e
// nessuna delle due schermate diceva quale fosse quello buono.
//
// Qui i due materiali si mettono insieme una volta, con un rapporto dichiarato:
//
//   IL GIUDIZIO È IL SEMAFORO. Gerarchico e non compensatorio: una soglia
//   dell'art. 25-novies superata o un patrimonio netto negativo sono fatti e
//   nessun indice di bilancio li annulla. Dice anche ciò che manca, e con
//   quale copertura.
//
//   LE CINQUE DIMENSIONI SONO LA SPIEGAZIONE. Non hanno un totale, non hanno
//   fasce, non hanno pesi: dicono da dove viene l'attenzione (esposizione,
//   struttura, dinamica, affidabilità, quadro procedurale) e che cosa non si è
//   potuto misurare. Non possono cambiare l'esito: `componiEsitoVerifica`
//   riceve il giudizio già formato e non lo tocca.
//
// Funzione pura, con i suoi test: la coerenza fra le due letture non dipende
// dall'ordine in cui le si guarda a schermo.

import type { Attenzione } from '@/lib/screening/indicatore';
import { NOME_DIMENSIONE, type Componente, type Dimensione } from '@/lib/iai/dimensioni';

/** Un determinante in chiaro, con la dimensione che lo porta. */
export interface Determinante {
  dimensione: Dimensione;
  /** «B · Struttura patrimoniale e finanziaria» */
  etichetta: string;
  testo: string;
}

export interface EsitoVerifica {
  /** L'unico giudizio: quello del semaforo. */
  giudizio: Attenzione;
  /** Le cinque dimensioni, nell'ordine A-E: spiegazione, non punteggio. */
  dimensioni: Componente[];
  /** Fino a tre determinanti, dai più intensi: la testa di ciò che pesa. */
  determinanti: Determinante[];
}

/**
 * Unisce giudizio e dimensioni. Il giudizio entra e esce identico: è questo il
 * punto — nessuna dimensione, per quanto alta, può riscriverlo.
 */
export function componiEsitoVerifica(input: {
  giudizio: Attenzione;
  dimensioni: Componente[];
}): EsitoVerifica {
  const determinanti = input.dimensioni
    .filter((c) => c.punteggio >= 50 && c.motivi.length > 0)
    .sort((a, b) => b.punteggio - a.punteggio)
    .slice(0, 3)
    .map((c) => ({
      dimensione: c.dimensione,
      etichetta: `${c.dimensione} · ${NOME_DIMENSIONE[c.dimensione]}`,
      testo: c.motivi[0],
    }));
  return { giudizio: input.giudizio, dimensioni: input.dimensioni, determinanti };
}
