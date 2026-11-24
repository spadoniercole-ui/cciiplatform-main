'use server';

// PARAMETRI DELLA SIMULAZIONE DEL PIANO — le leve che l'AI usa per scrivere le
// ipotesi del piano di sviluppo (pagina /parametri/piano-simulazione).
//
// Sono quattro valori che il codice teneva fissi; qui l'ente li governa per il
// proprio spazio. Salvare `null` riporta tutti i campi al predefinito di
// sistema, senza lasciare nel database un numero che nessuno ha scelto. Solo
// Admin di spazio: valgono per tutte le aziende.

import { richiediAccessoSchema } from '@/lib/autorizzazione';
import {
  validaParametriSimulazione,
  type ParametriSimulazionePiano,
} from '@/lib/piano/parametriSimulazione';
import {
  leggiParametriSimulazione,
  scriviParametriSimulazione,
} from '@/lib/piano/letturaParametriSimulazione';

export interface RisultatoParametriSimulazione {
  success: boolean;
  parametri?: ParametriSimulazionePiano;
  personalizzati?: boolean;
  error?: string;
}

export async function ottieniParametriPianoSimulazioneAction(
  nomeSchema: string
): Promise<RisultatoParametriSimulazione> {
  try {
    await richiediAccessoSchema(nomeSchema);
    const lettura = await leggiParametriSimulazione(nomeSchema);
    return {
      success: true,
      parametri: lettura.parametri,
      personalizzati: lettura.personalizzati,
    };
  } catch (error: unknown) {
    console.error('[ottieniParametriPianoSimulazioneAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile leggere i parametri: ${(error as Error).message || error}`,
    };
  }
}

export async function salvaParametriPianoSimulazioneAction(
  nomeSchema: string,
  parametri: ParametriSimulazionePiano | null
): Promise<RisultatoParametriSimulazione> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (parametri) {
      const errori = validaParametriSimulazione(parametri);
      if (errori.length > 0) return { success: false, error: errori.join(' ') };
    }
    await scriviParametriSimulazione(nomeSchema, parametri);
    const lettura = await leggiParametriSimulazione(nomeSchema);
    return {
      success: true,
      parametri: lettura.parametri,
      personalizzati: lettura.personalizzati,
    };
  } catch (error: unknown) {
    console.error('[salvaParametriPianoSimulazioneAction] Errore:', error);
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}
