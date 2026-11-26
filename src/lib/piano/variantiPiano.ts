// src/lib/piano/variantiPiano.ts
//
// I NOMI DELLE VARIANTI DEL PIANO (0.256.41).
//
// La variante dell'analisi è una sola, «elaborazione-ai»: quando l'analisi
// elabora di nuovo, il piano precedente non si perde — prende un nome suo e
// resta confrontabile nell'elenco delle varianti. Il nome deve stare nei
// limiti di `salvaPianoSviluppoAction`: [a-z0-9_-], al massimo 30 caratteri.
//
// Logica pura, con i suoi test.

import { VARIANTE_AI } from './elaborazioneAi';

export const PREFISSO_ARCHIVIO_AI = `${VARIANTE_AI}-archiviata-`;

/** Il primo nome libero per mettere da parte la variante dell'analisi. */
export function nomeArchivioElaborazione(esistenti: readonly string[]): string {
  const presi = new Set(esistenti);
  for (let i = 1; i <= 99; i++) {
    const nome = `${PREFISSO_ARCHIVIO_AI}${i}`;
    if (!presi.has(nome)) return nome;
  }
  // I 99 nomi numerati sono esauriti: un suffisso breve e diverso per ognuno.
  return `${VARIANTE_AI}-arch-${Date.now().toString(36)}`.slice(0, 30);
}
