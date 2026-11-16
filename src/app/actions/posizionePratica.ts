'use server';

// LA POSIZIONE: il registro delle decisioni (0.242.0).
//
// Due sole operazioni: leggere la traccia delle decisioni e aggiungerne una.
// La pagina della Posizione vive fra le schermate Admin (verifica-salute), e
// come loro chiede i permessi da Admin di spazio: la traccia di una decisione
// non è un dato operativo, è ciò che l'ente oppone quando qualcuno chiede
// perché.
//
// Tutta la logica pura sta in src/lib/posizionePratica/decisioni.ts; qui si
// autorizza e si scrive.

import { richiediAccessoSchema } from '@/lib/autorizzazione';
import {
  leggiDecisioniPratica,
  registraDecisionePratica,
} from '@/lib/posizionePratica/registroDecisioni';
import type { BozzaDecisione, Decisione } from '@/lib/posizionePratica/decisioni';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export async function leggiDecisioniPraticaAction(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; decisioni: Decisione[]; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) {
      return { success: false, decisioni: [], error: 'Nome schema non valido.' };
    }
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, decisioni: [], error: 'Azienda non riconosciuta.' };
    }
    return { success: true, decisioni: await leggiDecisioniPratica(nomeSchema, aziendaId) };
  } catch (error: unknown) {
    console.error('[leggiDecisioniPraticaAction] Errore:', error);
    return {
      success: false,
      decisioni: [],
      error: `Lettura non riuscita: ${(error as Error).message}`,
    };
  }
}

export async function registraDecisionePraticaAction(
  nomeSchema: string,
  aziendaId: number,
  bozza: Partial<BozzaDecisione>
): Promise<{ success: boolean; decisione?: Decisione; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, error: 'Azienda non riconosciuta.' };
    }
    return await registraDecisionePratica(nomeSchema, aziendaId, bozza);
  } catch (error: unknown) {
    console.error('[registraDecisionePraticaAction] Errore:', error);
    return { success: false, error: `Decisione non registrata: ${(error as Error).message}` };
  }
}
