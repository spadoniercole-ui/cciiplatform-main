'use server';

// L'ESITO DELLA VERIFICA — uno solo, con la sua spiegazione.
//
// Legge il giudizio (semaforo: soglie di legge, patrimonio, indici, copertura)
// e le cinque dimensioni (esposizione, struttura, dinamica, affidabilità,
// quadro procedurale). Il rapporto fra i due è dichiarato in
// `src/lib/verifica/esito.ts`: il giudizio è il semaforo, le dimensioni sono
// la spiegazione. Questa azione non decide nulla: compone.
//
// Nulla viene memorizzato: l'esito si ricalcola a ogni apertura, così non può
// divergere dai dati che lo sostengono.

import { componiEsitoVerifica, type EsitoVerifica } from '@/lib/verifica/esito';
import type { DebitoInBilancio } from '@/lib/verifica/debitoInBilancio';
import { componiIconografia, type IconografiaDimensioni } from '@/lib/ritratto/iconografia';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { diagnosticaIaiAction } from '@/app/actions/iai';
import { richiediAccessoSchema } from '@/lib/autorizzazione';

export interface RisultatoEsitoVerifica {
  success: boolean;
  esito?: EsitoVerifica;
  /** Il debito dell’ente ritrovato o no in bilancio (0.256.5). */
  debitoInBilancio?: DebitoInBilancio;
  /** Grafici, avviso e visura per i box A-E (0.256.6). */
  iconografia?: IconografiaDimensioni;
  error?: string;
}

export async function ottieniEsitoVerificaAction(
  nomeSchema: string,
  aziendaId: number,
  tipoSpazio: 'ENTE' | 'NON_ENTE'
): Promise<RisultatoEsitoVerifica> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };

    // Le due letture in parallelo. Se le dimensioni non si leggono, l'esito
    // resta quello del semaforo: un dato mancante non deve togliere il
    // giudizio, che non dipende da loro.
    const [giudizioRis, dimensioniRis] = await Promise.all([
      ottieniAttenzioneScreeningAction(nomeSchema, aziendaId),
      diagnosticaIaiAction(nomeSchema, aziendaId, tipoSpazio).catch(() => null),
    ]);
    if (!giudizioRis.success || !giudizioRis.attenzione) {
      return { success: false, error: giudizioRis.error ?? 'Esito non calcolabile.' };
    }

    // L'ICONOGRAFIA DEI BOX A-E (0.256.6). Si compone dagli stessi dati su cui
    // le dimensioni hanno già misurato: qui non si ricalcola nulla. Il valore
    // attualizzato non c'è ancora — la pagina della contabile precede lo
    // scenario — e il box lo dichiara invece di mostrare il solo storico come
    // se fosse l'intera lettura.
    const dimensioni =
      dimensioniRis?.success && dimensioniRis.dimensioni ? dimensioniRis.dimensioni : [];
    const datiIai = dimensioniRis?.success ? (dimensioniRis.dati ?? null) : null;
    const debito = dimensioniRis?.debitoInBilancio ?? null;

    return {
      success: true,
      debitoInBilancio: dimensioniRis?.debitoInBilancio,
      esito: componiEsitoVerifica({ giudizio: giudizioRis.attenzione, dimensioni }),
      iconografia: datiIai
        ? componiIconografia(datiIai, dimensioni, { debito, prospettico: null })
        : undefined,
    };
  } catch (error: unknown) {
    console.error('[ottieniEsitoVerificaAction]', error);
    return { success: false, error: `Esito non calcolabile: ${(error as Error).message}` };
  }
}
