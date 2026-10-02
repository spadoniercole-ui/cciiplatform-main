// src/lib/posizioneAggiornata/letturaPdfServer.ts
//
// Chiamata AI che legge una situazione contabile PDF e la riporta nei campi
// della Posizione Aggiornata. Usata dal passo Posizione Aggiornata e dal
// caricamento unico dei documenti ricevuti. Modulo lato server.

import type Anthropic from '@anthropic-ai/sdk';
import {
  normalizzaLetturaPosizione,
  promptLetturaPosizione,
  type LetturaPosizionePdf,
} from './letturaPdf';

export async function leggiPosizioneDaPdf(
  anthropic: Anthropic,
  base64: string,
  nome: string,
  scadenzaMs = 110 * 1000
): Promise<LetturaPosizionePdf | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), scadenzaMs);
  let risposta: Anthropic.Messages.Message;
  try {
    risposta = await anthropic.messages.create(
      {
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                title: nome,
              },
              { type: 'text', text: promptLetturaPosizione() },
            ],
          },
        ],
      },
      { signal: controller.signal }
    );
  } finally {
    clearTimeout(timer);
  }
  const testo = risposta.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const i = testo.indexOf('{');
  const j = testo.lastIndexOf('}');
  try {
    const lettura = normalizzaLetturaPosizione(
      i >= 0 && j > i ? JSON.parse(testo.slice(i, j + 1)) : null
    );
    return lettura.trovati.length > 0 ? lettura : null;
  } catch {
    return null;
  }
}
