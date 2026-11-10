// SITUAZIONE E CRONOLOGIA NELLA RELAZIONE (0.192.0).
//
// La Relazione finale è il documento che esce dalla piattaforma: deve dire per
// intero che cosa si stava valutando e come ci si è arrivati. Il blocco è
// deterministico — non lo inventa il modello — così date, atti e autori sono
// quelli registrati, non una ricostruzione.

import { etichettaIstruttoria, type TipoIstruttoria } from '@/lib/giudice/lettura';
import type { VoceStoricoSituazione } from '@/lib/scenari/storicoSituazione';
import { dataItaliana } from '@/lib/scenari/situazione';

export function bloccoSituazioneRelazione(input: {
  situazione: TipoIstruttoria;
  storico: VoceStoricoSituazione[];
}): string {
  const righe = input.storico.map((voce) => {
    const autore = voce.autore ? ` — ${voce.autore}` : '';
    const annullato = voce.annullatoIl
      ? ` (annullato${voce.annullatoDa ? ` da ${voce.annullatoDa}` : ''})`
      : '';
    return `- ${dataItaliana(voce.cambiataIl)}: da ${etichettaIstruttoria(
      voce.da as TipoIstruttoria | null
    )} a ${etichettaIstruttoria(voce.a as TipoIstruttoria)}${autore}${annullato}`;
  });

  return [
    'SITUAZIONE E CRONOLOGIA DELLO SCENARIO',
    `Situazione attuale: ${etichettaIstruttoria(input.situazione)}.`,
    righe.length > 0
      ? `Cambi registrati:\n${righe.join('\n')}`
      : 'Nessun cambio di situazione registrato.',
    'Riporta questa sezione per intero nella Relazione, senza riassumerla e senza cambiare date, atti o autori.',
  ].join('\n');
}
