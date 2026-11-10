'use server';

// IL DEBITO MEMORIZZATO — lettura e aggiornamento.
//
// La memorizzazione automatica avviene quando la verifica amministrativa
// registra il proprio esito (`registraEsitoVerificaAction`). Qui restano le due
// operazioni esplicite: rileggere la cifra memorizzata — è ciò che userà la
// verifica contabile — e rinnovarla quando gli archivi dell'ente sono cambiati
// senza che la verifica sia stata rifatta.
//
// Scrittura riservata all'Admin di spazio, come la verifica amministrativa da
// cui il dato nasce; la lettura passa dal controllo sull'azienda, perché è un
// dato dell'ente su quella posizione.

import { richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';
import {
  leggiDebitoEnteMemorizzato,
  memorizzaDebitoEnte,
  type DebitoMemorizzatoLetto,
} from '@/lib/debitiEnte/memorizzaDebitoEnte';
import type { DebitoMemorizzato } from '@/lib/debitiEnte/memorizzazione';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface RisultatoDebitoMemorizzato {
  success: boolean;
  debito?: DebitoMemorizzato;
  memorizzatoIl?: string | null;
  error?: string;
}

export async function debitoEnteMemorizzatoAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoDebitoMemorizzato> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const letto: DebitoMemorizzatoLetto | null = await leggiDebitoEnteMemorizzato(
      nomeSchema,
      aziendaId
    );
    if (!letto) {
      return {
        success: true,
        memorizzatoIl: null,
        error: 'Nessun debito memorizzato: la verifica amministrativa non è ancora stata chiusa.',
      };
    }
    return {
      success: true,
      debito: letto.debito,
      memorizzatoIl: letto.memorizzatoIl,
    };
  } catch (error: unknown) {
    console.error('[debitoEnteMemorizzatoAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

/**
 * Rilegge gli archivi e sostituisce la cifra memorizzata. Non tocca lo
 * scenario: la contabile la leggerà come il dato della verifica più recente.
 */
export async function aggiornaDebitoEnteMemorizzatoAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoDebitoMemorizzato> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const debito = await memorizzaDebitoEnte(nomeSchema, aziendaId);
    if (!debito) {
      return {
        success: false,
        error:
          'Nessun debito da memorizzare: mancano certificazione dei debiti e posizioni del triage.',
      };
    }
    return {
      success: true,
      debito,
      memorizzatoIl: new Date().toISOString().slice(0, 10),
    };
  } catch (error: unknown) {
    console.error('[aggiornaDebitoEnteMemorizzatoAction] Errore:', error);
    return { success: false, error: `Aggiornamento non riuscito: ${(error as Error).message}` };
  }
}
