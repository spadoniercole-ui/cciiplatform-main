// src/lib/revisore/correzioneServer.ts
//
// La passata correttiva lato server: revisione, una riscrittura del modello
// se restano blocchi, scelta della versione migliore. Usata dalle tre azioni
// che generano testi (Screening, Relazione dello scenario, documenti di
// corredo). Non lancia mai: se la riscrittura fallisce, resta l'originale.

import type Anthropic from '@anthropic-ai/sdk';
import { promptCorrezione, scegliVersione, type EsitoCorrezione } from './correzione';
import { revisionaTesto } from './revisore';
import type { TipoOutput } from './livelli';
import type { Evidenza } from '@/lib/fascicolo/evidenza';

export async function correggiConRevisore(
  anthropic: Anthropic,
  testo: string,
  tipo: TipoOutput,
  opzioni: { fascicolo?: Evidenza[] | null; signal?: AbortSignal; maxTokens?: number } = {}
): Promise<EsitoCorrezione> {
  const fascicolo = opzioni.fascicolo ?? null;
  const prima = revisionaTesto(testo, tipo, { fascicolo });
  if (prima.conteggi.BLOCCO === 0) {
    return { testo, revisione: prima, corretto: false, blocchiPrima: 0, blocchiDopo: 0 };
  }
  let riscritto: string | null = null;
  try {
    const risposta = await anthropic.messages.create(
      {
        model: 'claude-sonnet-5',
        max_tokens: opzioni.maxTokens ?? 8000,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: promptCorrezione(testo, prima) }],
      },
      opzioni.signal ? { signal: opzioni.signal } : undefined
    );
    riscritto = risposta.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (risposta.stop_reason === 'max_tokens') riscritto = null;
  } catch (e) {
    console.error('[correggiConRevisore] riscrittura non riuscita:', e);
  }
  return scegliVersione(testo, riscritto, tipo, fascicolo);
}

/** Riga di sintesi da anteporre al testo salvato: dichiara la correzione automatica. */
export function notaCorrezione(esito: EsitoCorrezione): string {
  if (!esito.corretto) return '';
  return `[Revisione automatica: ${esito.blocchiPrima} ${esito.blocchiPrima === 1 ? 'rilievo risolto' : 'rilievi, ridotti a'} ${esito.blocchiPrima === 1 ? '' : esito.blocchiDopo} con una riscrittura mirata; dati e struttura invariati.]\n\n`;
}
