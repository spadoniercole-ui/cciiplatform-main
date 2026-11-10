'use server';

// VERIFICA AZIENDA — la simulazione che unisce le due verifiche.
//
// Legge gli anni di bilancio depositati (contabile), il debito memorizzato a
// fine verifica amministrativa, applica il profilo scelto (standard,
// migliorativo, peggiorativo) e restituisce la mappa a colonne affiancate con
// gli indici. Il calcolo sta in src/lib/verificaAzienda/simulazione.ts, che è
// puro e ha i suoi test; qui si autorizza, si legge e si conserva.
//
// Le annualità di proiezione si fissano nello spazio (una riga di
// configurazione), non azienda per azienda: lo stesso orizzonte per tutte le
// posizioni, altrimenti due relazioni della stessa data non sarebbero
// confrontabili.

import { pool } from '@/lib/db';
import { richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleVerificaAzienda } from '@/db/provision';
import {
  ANNUALITA_MASSIME,
  ANNUALITA_MINIME,
  ANNUALITA_PREDEFINITE,
  PROFILI,
  colonneSimulazione,
  type AnnoStorico,
  type EsitoSimulazione,
  type ProfiloSimulazione,
} from '@/lib/verificaAzienda/simulazione';
import { leggiDebitoEnteMemorizzato } from '@/lib/debitiEnte/memorizzaDebitoEnte';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface RisultatoConfigVerificaAzienda {
  success: boolean;
  annualita: number;
  error?: string;
}

export interface DebitoVerificaAzienda {
  totale: number;
  memorizzatoIl: string | null;
  fonte: string;
}

export interface RisultatoVerificaAzienda {
  success: boolean;
  esito?: EsitoSimulazione;
  debito?: DebitoVerificaAzienda | null;
  simulazioneId?: number;
  error?: string;
}

export async function ottieniConfigVerificaAziendaAction(
  nomeSchema: string
): Promise<RisultatoConfigVerificaAzienda> {
  try {
    await richiediAccessoSchema(nomeSchema);
    if (!schemaOk(nomeSchema)) {
      return { success: false, annualita: ANNUALITA_PREDEFINITE, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);
    const r = await pool.query(
      `SELECT annualita_proiezione FROM "${nomeSchema}".verifica_azienda_config WHERE id = 1`
    );
    const n = Number(r.rows[0]?.annualita_proiezione);
    return {
      success: true,
      annualita: Number.isFinite(n)
        ? Math.min(ANNUALITA_MASSIME, Math.max(ANNUALITA_MINIME, n))
        : ANNUALITA_PREDEFINITE,
    };
  } catch (error: unknown) {
    console.error('[ottieniConfigVerificaAziendaAction] Errore:', error);
    return {
      success: false,
      annualita: ANNUALITA_PREDEFINITE,
      error: `Impossibile leggere la configurazione: ${(error as Error).message}`,
    };
  }
}

export async function impostaConfigVerificaAziendaAction(
  nomeSchema: string,
  annualita: number
): Promise<RisultatoConfigVerificaAzienda> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) {
      return { success: false, annualita: ANNUALITA_PREDEFINITE, error: 'Nome schema non valido.' };
    }
    if (
      !Number.isInteger(annualita) ||
      annualita < ANNUALITA_MINIME ||
      annualita > ANNUALITA_MASSIME
    ) {
      return {
        success: false,
        annualita: ANNUALITA_PREDEFINITE,
        error: `Le annualità di proiezione stanno fra ${ANNUALITA_MINIME} e ${ANNUALITA_MASSIME}.`,
      };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".verifica_azienda_config (id, annualita_proiezione, updated_at)
       VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET annualita_proiezione = EXCLUDED.annualita_proiezione, updated_at = now()`,
      [annualita]
    );
    return { success: true, annualita };
  } catch (error: unknown) {
    console.error('[impostaConfigVerificaAziendaAction] Errore:', error);
    return {
      success: false,
      annualita: ANNUALITA_PREDEFINITE,
      error: `Impossibile salvare la configurazione: ${(error as Error).message}`,
    };
  }
}

/**
 * Calcola la mappa e la conserva. Il profilo è una scelta dell'operatore, non
 * un valore dedotto: tre profili, tre simulazioni distinte, tutte leggibili
 * nello storico.
 */
export async function calcolaVerificaAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  profilo: ProfiloSimulazione,
  annualita?: number
): Promise<RisultatoVerificaAzienda> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!PROFILI.some((p) => p.codice === profilo)) {
      return { success: false, error: 'Profilo di simulazione non riconosciuto.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);

    const config = await ottieniConfigVerificaAziendaAction(nomeSchema);
    const annualitaScelta = annualita ?? config.annualita;

    const bilancioRis = await pool.query(
      `SELECT anno_bilancio, dati_finanziari FROM "${nomeSchema}".xbrl_storico_azienda
        WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL
        ORDER BY anno_bilancio ASC`,
      [aziendaId]
    );
    const anni: AnnoStorico[] = bilancioRis.rows
      .map((r) => ({
        anno: Number(r.anno_bilancio),
        dati: r.dati_finanziari as DatiFinanziariPeriodo,
      }))
      .filter(
        (a) => Number.isInteger(a.anno) && a.dati && typeof a.dati.ricaviVendite === 'number'
      );

    const memorizzato = await leggiDebitoEnteMemorizzato(nomeSchema, aziendaId);
    const debito = memorizzato
      ? {
          totale: memorizzato.debito.totale,
          memorizzatoIl: memorizzato.memorizzatoIl,
          fonte: memorizzato.debito.fonte,
        }
      : null;

    const esito = colonneSimulazione({
      anni,
      profilo,
      annualita: annualitaScelta,
      debitoEnte: debito?.totale ?? 0,
    });

    let simulazioneId: number | undefined;
    if (esito.colonne.length > 0) {
      const inserita = await pool.query(
        `INSERT INTO "${nomeSchema}".verifica_azienda_simulazioni
           (azienda_id, profilo, annualita, debito_ente, crescita_storica_pct,
            crescita_applicata_pct, colonne, avvertenze)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          aziendaId,
          esito.profilo,
          esito.annualita,
          esito.debitoEnte,
          esito.crescitaStoricaPct,
          esito.crescitaApplicataPct,
          JSON.stringify(esito.colonne),
          JSON.stringify(esito.avvertenze),
        ]
      );
      simulazioneId = Number(inserita.rows[0]?.id);
    }

    return { success: true, esito, debito, simulazioneId };
  } catch (error: unknown) {
    console.error('[calcolaVerificaAziendaAction] Errore:', error);
    return { success: false, error: `Simulazione non riuscita: ${(error as Error).message}` };
  }
}
