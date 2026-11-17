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
//
// LA FIRMA VERIFICA LA POSIZIONE (0.244.0). Prima di scrivere, l'azione
// rilegge la posizione con la stessa lettura della pagina, ne ricalcola
// l'impronta e la confronta con quella che il modulo ha ricevuto. Se il credito,
// la copertura o i blocchi sono cambiati nel frattempo, la decisione non si
// registra: meglio un rifiuto che una traccia che annota numeri che nessuno ha
// visto. Credito, copertura e stato non arrivano dal browser: sono quelli letti
// qui, e servono solo a rendere la riga leggibile fra sei mesi.

import { richiediAccessoSchema, richiediSessione } from '@/lib/autorizzazione';
import {
  leggiDecisioniPratica,
  registraDecisionePratica,
} from '@/lib/posizionePratica/registroDecisioni';
import {
  autoreDaSessione,
  validaCoerenzaDecisione,
  type BozzaDecisione,
  type Decisione,
} from '@/lib/posizionePratica/decisioni';
import { componiPosizione, improntaPosizione } from '@/lib/posizionePratica/composizione';
import { leggiPosizioneAzienda } from '@/lib/posizionePratica/letturaPosizione';

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
  bozza: Partial<
    Omit<
      BozzaDecisione,
      | 'autore'
      | 'autoreId'
      | 'autoreModalita'
      | 'statoGrado'
      | 'statoBlocchi'
      | 'credito'
      | 'copertura'
    >
  >,
  improntaAttesa: string
): Promise<{ success: boolean; decisione?: Decisione; error?: string }> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, error: 'Azienda non riconosciuta.' };
    }
    // LA DECISIONE SI FIRMA DA ENTE, NON IN ISPEZIONE (0.243.0).
    // In salvagente il Superadmin opera per guardare, non per decidere: la
    // firma sarebbe la sua, non quella dell'ente, e fra sei mesi il registro
    // mostrerebbe un atto dell'organizzazione che l'organizzazione non ha
    // compiuto. L'azione rifiuta; la pagina lo spiega prima del clic.
    if (contesto.modalita === 'SALVAGENTE') {
      return {
        success: false,
        error:
          'Stai operando in salvagente: la decisione spetta all’ente. Entra con un’utenza dello spazio per firmarla.',
      };
    }
    // L'autore NON si accetta dal chiamante: nome dalla sessione e id
    // dell'utente dello spazio dal contesto di accesso. Così nessuno può
    // firmare una decisione con il nome di un altro.
    const autore = autoreDaSessione(await richiediSessione());
    if (!autore) {
      return {
        success: false,
        error: 'La sessione non dice chi sta decidendo: autenticarsi di nuovo.',
      };
    }

    // LA POSIZIONE SI RILEGGE, NON SI CREDE AL MODULO (0.244.0).
    const lettura = await leggiPosizioneAzienda(nomeSchema, aziendaId);
    if (!lettura.dati) {
      return { success: false, error: 'Azienda non trovata: la posizione non si può leggere.' };
    }
    const posizione = componiPosizione(lettura.dati);
    if (!improntaAttesa || improntaAttesa !== improntaPosizione(posizione)) {
      return {
        success: false,
        error:
          'La posizione è cambiata da quando hai aperto la pagina: rileggi i numeri e rifirma. La decisione non è stata registrata.',
      };
    }
    const coerenza = validaCoerenzaDecisione(bozza.esito, {
      grado: posizione.prontezza.grado,
      blocchi: posizione.prontezza.blocchi,
    });
    if (!coerenza.valida) {
      return {
        success: false,
        error: coerenza.errore ?? 'La decisione non è coerente con la posizione.',
      };
    }

    return await registraDecisionePratica(nomeSchema, aziendaId, {
      ...bozza,
      autore,
      autoreId: contesto.adminId ?? contesto.utenteId ?? null,
      autoreModalita: contesto.modalita,
      // I numeri annotati sono quelli verificati, non quelli mostrati.
      credito: posizione.credito,
      copertura: posizione.coperturaTesto,
      statoGrado: posizione.prontezza.grado,
      statoBlocchi: posizione.prontezza.blocchi.length,
    });
  } catch (error: unknown) {
    console.error('[registraDecisionePraticaAction] Errore:', error);
    return { success: false, error: `Decisione non registrata: ${(error as Error).message}` };
  }
}
