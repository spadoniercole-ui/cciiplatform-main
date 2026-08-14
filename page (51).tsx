'use server';

// Dati di Settore: confronto tra l'azienda e l'andamento ISTAT del suo
// settore (gruppo ATECO). Non interroga mai ISTAT automaticamente — solo
// su richiesta esplicita dell'operatore (aggiornaDatiSettoreAction),
// perché il limite di frequenza di ISTAT (5 richieste/minuto per IP) ha
// una penalità severa (blocco di 1-2 giorni) se superato: meglio un dato
// che l'operatore aggiorna quando serve, che una funzione che rischia di
// bloccarsi da sola per tutti gli spazi.

import { pool } from '@/lib/db';
import { assicuraTabellaDatiSettore } from '@/db/provision';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { analizzaCodiceAteco, type InfoSettoreAteco } from '@/lib/settore/atecoMapping';
import { interrogaIstat, type PuntoSerieIstat } from '@/lib/settore/istatClient';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';

/** Ore prima delle quali un dato ISTAT già in cache è considerato "abbastanza fresco" da non richiedere un nuovo aggiornamento automatico. */
const ORE_FRESCHEZZA_CACHE = 24;

/** Solo per il trigger automatico del percorso Ricevente (prima riga
 * proposta caricata) — MAI chiamata da un ciclo o in loop, sempre una
 * tantum. Aggiorna solo se non c'è già un dato recente in cache; se
 * il gruppo ATECO non è coperto, o la licenza non lo include, esce in
 * silenzio senza generare errori visibili all'utente (non è un'azione
 * esplicita sua, non deve interromperlo). Il rate-limiter di
 * interrogaIstat resta comunque l'ultima rete di sicurezza. */
export async function aggiornaDatiSettoreSeNecessarioAction(
  nomeSchema: string,
  aziendaId: number
): Promise<void> {
  try {
    const plusRis = await ottieniFunzioniPlusSpazio(nomeSchema);
    if (!plusRis.funzioni.datiSettore) return;

    const aziendaRis = await ottieniAziendaPerId(nomeSchema, aziendaId);
    if (!aziendaRis.success || !aziendaRis.azienda?.codiceAteco) return;
    const info = analizzaCodiceAteco(aziendaRis.azienda.codiceAteco);
    if (!info || !info.dataflow) return;

    await assicuraTabellaDatiSettore();
    const cacheRis = await pool.query(
      `SELECT aggiornato_il FROM public.dati_settore_cache WHERE gruppo_ateco = $1 AND dataflow = $2`,
      [info.gruppo, info.dataflow]
    );
    if (cacheRis.rows.length > 0) {
      const oreTrascorse =
        (Date.now() - new Date(cacheRis.rows[0].aggiornato_il).getTime()) / (1000 * 60 * 60);
      if (oreTrascorse < ORE_FRESCHEZZA_CACHE) return; // già fresco, nessuna chiamata necessaria
    }

    const risultato = await interrogaIstat(info.dataflow, info.gruppo, info.divisione);
    if (!risultato.successo) return; // silenzioso — non è un'azione esplicita dell'utente

    await pool.query(
      `INSERT INTO public.dati_settore_cache (gruppo_ateco, dataflow, dati, aggiornato_il)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (gruppo_ateco, dataflow) DO UPDATE SET dati = EXCLUDED.dati, aggiornato_il = now()`,
      [
        info.gruppo,
        info.dataflow,
        JSON.stringify({ punti: risultato.punti, livelloUsato: risultato.livelloUsato }),
      ]
    );
  } catch (error: any) {
    console.error('[aggiornaDatiSettoreSeNecessarioAction] Errore (silenzioso):', error);
  }
}

export interface RisultatoDatiSettore {
  success: boolean;
  info: InfoSettoreAteco | null;
  punti: PuntoSerieIstat[];
  livelloUsato: 'gruppo' | 'divisione' | null;
  aggiornatoIl: string | null;
  error?: string;
}

export async function ottieniDatiSettore(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoDatiSettore> {
  const vuoto = {
    success: false as const,
    info: null,
    punti: [],
    livelloUsato: null,
    aggiornatoIl: null,
  };
  try {
    const aziendaRis = await ottieniAziendaPerId(nomeSchema, aziendaId);
    if (!aziendaRis.success || !aziendaRis.azienda) {
      return { ...vuoto, error: 'Azienda non trovata.' };
    }
    const codiceAteco = aziendaRis.azienda.codiceAteco;
    if (!codiceAteco) {
      return {
        ...vuoto,
        error:
          'Nessun codice ATECO impostato per questa azienda. Impostalo in Aziende → questa azienda, o caricando un bilancio XBRL (il codice del file, se presente, viene sincronizzato automaticamente).',
      };
    }

    const info = analizzaCodiceAteco(codiceAteco);
    if (!info) {
      return { ...vuoto, error: `Codice ATECO "${codiceAteco}" non riconoscibile.` };
    }
    if (!info.dataflow) {
      return { ...vuoto, info, error: info.motivoAssenza || 'Settore non coperto.' };
    }

    await assicuraTabellaDatiSettore();
    const cacheRis = await pool.query(
      'SELECT dati, aggiornato_il FROM public.dati_settore_cache WHERE gruppo_ateco = $1 AND dataflow = $2',
      [info.gruppo, info.dataflow]
    );

    if (cacheRis.rows.length === 0) {
      return {
        success: true,
        info,
        punti: [],
        livelloUsato: null,
        aggiornatoIl: null,
      };
    }

    const salvato = cacheRis.rows[0].dati;
    // Compatibilità con la cache scritta prima di questa consegna
    // (array puro di punti, senza livelloUsato) — non forzare un
    // reset per chi ha già dati salvati.
    const puntiSalvati: PuntoSerieIstat[] = Array.isArray(salvato) ? salvato : salvato.punti || [];
    const livelloSalvato: 'gruppo' | 'divisione' | null = Array.isArray(salvato)
      ? null
      : salvato.livelloUsato || null;

    return {
      success: true,
      info,
      punti: puntiSalvati,
      livelloUsato: livelloSalvato,
      aggiornatoIl: cacheRis.rows[0].aggiornato_il?.toString?.() || null,
    };
  } catch (error: any) {
    console.error('[ottieniDatiSettore] Errore:', error);
    return { ...vuoto, error: `Impossibile leggere i dati di settore: ${error.message || error}` };
  }
}

export interface RisultatoAggiornaDatiSettore {
  success: boolean;
  punti: PuntoSerieIstat[];
  livelloUsato?: 'gruppo' | 'divisione';
  error?: string;
}

/** Chiamata ISTAT esplicita, solo su azione dell'operatore — mai automatica. */
export async function aggiornaDatiSettoreAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoAggiornaDatiSettore> {
  try {
    const plusRis = await ottieniFunzioniPlusSpazio(nomeSchema);
    if (!plusRis.funzioni.datiSettore) {
      return {
        success: false,
        punti: [],
        error: 'Dati di Settore non è incluso nella licenza di questo spazio.',
      };
    }
    const aziendaRis = await ottieniAziendaPerId(nomeSchema, aziendaId);
    if (!aziendaRis.success || !aziendaRis.azienda?.codiceAteco) {
      return { success: false, punti: [], error: 'Codice ATECO non impostato per questa azienda.' };
    }
    const info = analizzaCodiceAteco(aziendaRis.azienda.codiceAteco);
    if (!info || !info.dataflow) {
      return {
        success: false,
        punti: [],
        error: info?.motivoAssenza || 'Settore non coperto dai dati disponibili.',
      };
    }

    const risultato = await interrogaIstat(info.dataflow, info.gruppo, info.divisione);
    if (!risultato.successo) {
      return { success: false, punti: [], error: risultato.errore };
    }

    await assicuraTabellaDatiSettore();
    await pool.query(
      `INSERT INTO public.dati_settore_cache (gruppo_ateco, dataflow, dati, aggiornato_il)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (gruppo_ateco, dataflow) DO UPDATE SET dati = EXCLUDED.dati, aggiornato_il = now()`,
      [
        info.gruppo,
        info.dataflow,
        JSON.stringify({ punti: risultato.punti, livelloUsato: risultato.livelloUsato }),
      ]
    );

    return { success: true, punti: risultato.punti, livelloUsato: risultato.livelloUsato };
  } catch (error: any) {
    console.error('[aggiornaDatiSettoreAction] Errore:', error);
    return {
      success: false,
      punti: [],
      error: `Impossibile aggiornare i dati di settore: ${error.message || error}`,
    };
  }
}
