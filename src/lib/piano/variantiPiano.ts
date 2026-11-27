// src/lib/piano/variantiPiano.ts
//
// I NOMI DELLE VARIANTI DEL PIANO (0.256.41, unificati nella 0.256.43).
//
// La variante dell'analisi è una sola, «elaborazione-ai»: quando l'analisi
// elabora di nuovo, il piano precedente non si perde — prende un nome suo,
// «elaborazione-ai-archiviata-N», e resta confrontabile nell'elenco delle
// varianti. Il nome deve stare nei limiti di `salvaPianoSviluppoAction`:
// [a-z0-9_-], al massimo 30 caratteri.
//
// Qui c'è anche come si chiamano le varianti a schermo, così il confronto, la
// valutazione e la sintesi non inventano ognuno un'etichetta diversa per la
// stessa riga.
//
// Logica pura, con i suoi test.

import { VARIANTE_AI } from './elaborazioneAi';

export const PREFISSO_ARCHIVIO_AI = `${VARIANTE_AI}-archiviata-`;

/** Il limite di `salvaPianoSviluppoAction`: oltre, il nome verrebbe troncato. */
const LUNGHEZZA_MASSIMA = 30;

/**
 * Il primo nome libero per mettere da parte la variante dell'analisi. Null se
 * sono presi tutti i nomi che stanno nel limite: chi chiama lo dice
 * all'operatore invece di sovrascrivere un piano.
 */
export function nomeArchivioElaborazione(esistenti: readonly string[]): string | null {
  const presi = new Set(esistenti);
  for (let i = 1; `${PREFISSO_ARCHIVIO_AI}${i}`.length <= LUNGHEZZA_MASSIMA; i++) {
    const nome = `${PREFISSO_ARCHIVIO_AI}${i}`;
    if (!presi.has(nome)) return nome;
  }
  return null;
}

/** true per la variante dell'analisi e per le sue versioni messe da parte. */
export function eVarianteDellAnalisi(variante: string): boolean {
  return variante === VARIANTE_AI || variante.startsWith(PREFISSO_ARCHIVIO_AI);
}

/** Come si chiama una variante nel confronto e negli elenchi. */
export function nomeVariantePiano(variante: string): string {
  if (variante === 'base') return 'Piano base';
  if (variante === VARIANTE_AI) return 'Piano AI';
  if (variante.startsWith(PREFISSO_ARCHIVIO_AI)) {
    const numero = variante.slice(PREFISSO_ARCHIVIO_AI.length);
    return numero ? `Piano AI messo da parte (${numero})` : 'Piano AI messo da parte';
  }
  return `Variante ${variante}`;
}
