'use server';

// LA RACCOMANDAZIONE DELLA VERIFICA AMMINISTRATIVA.
//
// L'esito amministrativo non resta un semaforo: dice quale strada conviene
// valutare — completare la contabile, valutare la liquidazione, valutare un
// accordo con cram down. Le regole stanno in
// src/lib/verificaAmministrativa/raccomandazione.ts (pure, con i test); qui si
// autorizza, si leggono i fatti già accertati e si compone l'esito.
//
// Non si ricalcola nulla: l'indicatore di attenzione, il debito memorizzato, lo
// stato della contabile e l'ultimo bilancio sono dati che la piattaforma ha già
// prodotto. Il DSCR non entra perché dal bilancio non è calcolabile, e il
// limite è dichiarato nella raccomandazione stessa.

import { pool } from '@/lib/db';
import { richiediAccessoAzienda } from '@/lib/autorizzazione';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import {
  raccomandaDecisione,
  type EsitoAmministrativo,
  type EsitoRaccomandazione,
} from '@/lib/verificaAmministrativa/raccomandazione';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface RisultatoRaccomandazione {
  success: boolean;
  raccomandazione?: EsitoRaccomandazione;
  error?: string;
}

export async function ottieniRaccomandazioneAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoRaccomandazione> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, error: 'Azienda non riconosciuta.' };
    }

    const [attenzioneRis, contabileRis, debitoRis] = await Promise.all([
      ottieniAttenzioneScreeningAction(nomeSchema, aziendaId).catch(() => null),
      statoVerificaContabileAction(nomeSchema).catch(() => null),
      debitoEnteMemorizzatoAction(nomeSchema, aziendaId).catch(() => null),
    ]);

    const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
    if (!attenzione) {
      return {
        success: false,
        error:
          'La verifica amministrativa non è ancora stata eseguita: non c’è un esito da cui partire.',
      };
    }

    const rigaContabile = contabileRis?.success
      ? contabileRis.aziende.find((a) => a.aziendaId === aziendaId)
      : undefined;

    // L'ultimo bilancio depositato: quanti indici sono oltre soglia e che
    // patrimonio netto risulta. Se la tabella non c'è (mai caricato un XBRL) si
    // resta senza: la raccomandazione lo tratta come «contabile necessaria».
    let indiciViolati: number | null = null;
    let patrimonioNetto: number | null = null;
    try {
      const bilancio = await pool.query(
        `SELECT indici, dati_finanziari
           FROM "${nomeSchema}".xbrl_storico_azienda
          WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL
          ORDER BY anno_bilancio DESC
          LIMIT 1`,
        [aziendaId]
      );
      const riga = bilancio.rows[0];
      if (riga) {
        if (Array.isArray(riga.indici)) {
          indiciViolati = riga.indici.filter(
            (i: { esito?: string }) => i?.esito === 'VIOLATO'
          ).length;
        }
        const pn = Number(riga.dati_finanziari?.patrimonioNetto);
        patrimonioNetto = Number.isFinite(pn) ? pn : null;
      }
    } catch {
      indiciViolati = null;
      patrimonioNetto = null;
    }

    const raccomandazione = raccomandaDecisione({
      esito: attenzione.esito as EsitoAmministrativo,
      fattoreDeterminante: attenzione.fattoreDeterminante,
      copertura: attenzione.copertura,
      debitoEnte: debitoRis?.debito?.totale ?? null,
      anniXbrl: rigaContabile?.anniXbrl ?? 0,
      parametriPresenti: rigaContabile?.parametriPresenti ?? false,
      indiciViolati,
      patrimonioNetto,
    });

    return { success: true, raccomandazione };
  } catch (error: unknown) {
    console.error('[ottieniRaccomandazioneAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile comporre la raccomandazione: ${(error as Error).message}`,
    };
  }
}
