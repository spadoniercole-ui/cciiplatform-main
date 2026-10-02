'use server';

// Posizione Aggiornata letta da un PDF (situazione contabile infrannuale
// ricevuta dall'azienda). Restituisce i valori per il prospetto: si salvano
// solo con «Salva», dopo il controllo dell'istruttore. Il file non si
// conserva.

import Anthropic from '@anthropic-ai/sdk';
import { del, get } from '@/lib/blobStore';
import { richiediAccessoScenario, verificaFileDelloSpazio } from '@/lib/autorizzazione';
import { erroreServizioEsterno, messaggioChiaveAiMancante } from '@/lib/serviziEsterni';
import { verificaScenarioNonBloccato } from '@/app/actions/scenari';
import {
  normalizzaLetturaPosizione,
  promptLetturaPosizione,
  type LetturaPosizionePdf,
} from '@/lib/posizioneAggiornata/letturaPdf';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 120 * 1000, maxRetries: 1 }) : null;

export async function leggiPosizioneDaPdfAction(
  nomeSchema: string,
  scenarioId: number,
  documento: { nome: string; url: string }
): Promise<{ success: boolean; lettura?: LetturaPosizionePdf; error?: string }> {
  const contesto = await richiediAccessoScenario(nomeSchema, scenarioId, {
    modulo: ['scenari'],
    livello: 'SCRITTURA',
  });
  verificaFileDelloSpazio(contesto, documento.url);
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    const bloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (bloccato) return { success: false, error: bloccato };
    if (!anthropic) return { success: false, error: messaggioChiaveAiMancante() };

    const r = await get(documento.url, { access: 'private' });
    if (!r || r.statusCode !== 200)
      return { success: false, error: `Impossibile leggere «${documento.nome}».` };
    const buffer = Buffer.from(await new Response(r.stream).arrayBuffer());
    if (!buffer.subarray(0, 5).toString('latin1').startsWith('%PDF-'))
      return { success: false, error: `«${documento.nome}» non è un PDF valido.` };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110 * 1000);
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
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: buffer.toString('base64'),
                  },
                  title: documento.nome,
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
    let grezzo: unknown = null;
    try {
      grezzo = i >= 0 && j > i ? JSON.parse(testo.slice(i, j + 1)) : null;
    } catch {
      grezzo = null;
    }
    if (!grezzo)
      return {
        success: false,
        error:
          'La lettura del documento non ha prodotto una risposta leggibile: riprova o compila a mano.',
      };
    const lettura = normalizzaLetturaPosizione(grezzo);
    if (lettura.trovati.length === 0)
      return {
        success: false,
        error:
          'Nel documento non sono stati trovati valori di bilancio da riportare nel prospetto.',
      };
    return { success: true, lettura };
  } catch (error: unknown) {
    console.error('[leggiPosizioneDaPdfAction]', error);
    return {
      success: false,
      error:
        erroreServizioEsterno(error, 'AI') ?? `Lettura non riuscita: ${(error as Error).message}`,
    };
  } finally {
    // Il documento ha finito il suo lavoro: i valori sono nel prospetto.
    await del(documento.url).catch(() => undefined);
  }
}
