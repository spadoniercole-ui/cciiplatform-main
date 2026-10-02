'use server';

// Posizione Aggiornata di uno scenario: bilanci di verifica infrannuali
// (o di fine anno non ancora deliberati), che si affiancano ai due anni
// già presenti nel file XBRL caricato per quell'azienda. Più
// caricamenti nel tempo sono ammessi — un'azienda può avere un
// bilancino al 31/12 e un altro al 31/03, ciascuno con la propria
// data. Chi consuma "la" posizione aggiornata (Indici, Simulazione,
// Brogliaccio) prende sempre quella con la data più recente: stessa
// forma dati (DatiFinanziariPeriodo) usata da anno corrente/precedente,
// nessun motore di calcolo da riscrivere per gestire più punti.

import {
  richiediAccessoSchema,
  richiediAccessoScenario,
  verificaRigaConsentita,
} from '@/lib/autorizzazione';
import { pool } from '@/lib/db';
import { assicuraTabellaPosizioneAggiornata } from '@/db/provision';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import { DATI_VUOTI } from '@/lib/posizioneAggiornata/schemaCampi';
import { verificaScenarioNonBloccato } from '@/app/actions/scenari';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface PosizioneAggiornata {
  id: number | null;
  dataRiferimento: string | null;
  deliberato: boolean;
  dati: DatiFinanziariPeriodo;
  aggiornataIl: string | null;
  /** 'bilancino' = importato da un bilancino di verifica; 'prospetto' = modello della piattaforma; 'manuale' o null = a mano. */
  origine: string | null;
  documentoId: number | null;
}

export interface ProvenienzaPosizione {
  origine: 'bilancino' | 'prospetto' | 'manuale' | 'documento';
  documentoId: number | null;
}

export interface RisultatoPosizioneAggiornata {
  success: boolean;
  posizione: PosizioneAggiornata;
  esiste: boolean;
  error?: string;
}

const VUOTA: PosizioneAggiornata = {
  id: null,
  dataRiferimento: null,
  deliberato: false,
  dati: DATI_VUOTI,
  aggiornataIl: null,
  origine: null,
  documentoId: null,
};

function rigaAPosizione(r: any): PosizioneAggiornata {
  return {
    id: r.id,
    dataRiferimento: r.data_riferimento ? r.data_riferimento.toISOString().slice(0, 10) : null,
    deliberato: r.deliberato,
    dati: { ...DATI_VUOTI, ...r.dati },
    aggiornataIl: r.updated_at?.toString?.() ?? null,
    origine: r.origine ?? null,
    documentoId: r.documento_id ?? null,
  };
}

/** La più recente tra tutte quelle caricate per lo scenario — quella
 * usata da Indici, Simulazione, Brogliaccio. Se c'è un solo
 * caricamento (caso comune, e l'unico caso per il Redigente, che non
 * usa il multi-caricamento), coincide con quello. */
export async function ottienePosizioneAggiornata(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoPosizioneAggiornata> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!validaSchema(nomeSchema)) {
      return {
        success: false,
        posizione: VUOTA,
        esiste: false,
        error: 'Nome schema non valido.',
      };
    }
    await assicuraTabellaPosizioneAggiornata(nomeSchema);

    const risultato = await pool.query(
      `SELECT id, data_riferimento, deliberato, dati, updated_at, origine, documento_id
       FROM "${nomeSchema}".posizione_aggiornata WHERE scenario_id = $1
       ORDER BY data_riferimento DESC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [scenarioId]
    );
    if (risultato.rows.length === 0) {
      return { success: true, posizione: VUOTA, esiste: false };
    }
    return { success: true, esiste: true, posizione: rigaAPosizione(risultato.rows[0]) };
  } catch (error: any) {
    console.error('[ottienePosizioneAggiornata] Errore:', error);
    return {
      success: false,
      posizione: VUOTA,
      esiste: false,
      error: `Impossibile caricare la posizione aggiornata: ${error.message || error}`,
    };
  }
}

export interface RisultatoElencoPosizioniAggiornate {
  success: boolean;
  posizioni: PosizioneAggiornata[];
  error?: string;
}

/** Tutte le posizioni caricate per lo scenario, più recenti prima — per
 * la vista in Posizione Aggiornata, dove l'utente vede lo storico dei
 * caricamenti fatti nel tempo. */
export async function ottieniTuttePosizioniAggiornate(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoElencoPosizioniAggiornate> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!validaSchema(nomeSchema)) {
      return { success: false, posizioni: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaPosizioneAggiornata(nomeSchema);
    const risultato = await pool.query(
      `SELECT id, data_riferimento, deliberato, dati, updated_at, origine, documento_id
       FROM "${nomeSchema}".posizione_aggiornata WHERE scenario_id = $1
       ORDER BY data_riferimento DESC NULLS LAST, updated_at DESC`,
      [scenarioId]
    );
    return { success: true, posizioni: risultato.rows.map(rigaAPosizione) };
  } catch (error: any) {
    console.error('[ottieniTuttePosizioniAggiornate] Errore:', error);
    return {
      success: false,
      posizioni: [],
      error: `Impossibile caricare lo storico: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazionePosizione {
  success: boolean;
  error?: string;
}

/** Aggiunge un nuovo caricamento, o corregge uno esistente se si passa
 * l'id di uno già presente — non più un upsert su scenario_id (un solo
 * record per scenario), un vero elenco. */
export async function salvaPosizioneAggiornataAction(
  nomeSchema: string,
  scenarioId: number,
  dataRiferimento: string | null,
  deliberato: boolean,
  dati: DatiFinanziariPeriodo,
  id?: number | null,
  provenienza?: ProvenienzaPosizione | null
): Promise<RisultatoOperazionePosizione> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    await assicuraTabellaPosizioneAggiornata(nomeSchema);
    // La provenienza si scrive solo quando è nota (import appena fatto):
    // un salvataggio a mano successivo non cancella quella registrata.
    const aggiornaProvenienza = async (condizione: string, parametri: unknown[]) => {
      if (!provenienza) return;
      await pool.query(
        `UPDATE "${nomeSchema}".posizione_aggiornata SET origine = $${parametri.length + 1}, documento_id = $${parametri.length + 2} WHERE ${condizione}`,
        [...parametri, provenienza.origine, provenienza.documentoId]
      );
    };

    if (id) {
      await pool.query(
        `UPDATE "${nomeSchema}".posizione_aggiornata
         SET data_riferimento = $2, deliberato = $3, dati = $4, updated_at = now()
         WHERE id = $1 AND scenario_id = $5`,
        [id, dataRiferimento, deliberato, JSON.stringify(dati), scenarioId]
      );
      await aggiornaProvenienza('id = $1 AND scenario_id = $2', [id, scenarioId]);
      return { success: true };
    }

    try {
      const inserita = await pool.query(
        `INSERT INTO "${nomeSchema}".posizione_aggiornata (scenario_id, data_riferimento, deliberato, dati)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [scenarioId, dataRiferimento, deliberato, JSON.stringify(dati)]
      );
      await aggiornaProvenienza('id = $1', [inserita.rows[0].id]);
      return { success: true };
    } catch (erroreInsert: any) {
      // Vincolo unico (scenario_id, data_riferimento): già esiste un
      // caricamento per quella data esatta — lo aggiorna invece di
      // fallire, coerente con "una posizione per data".
      if (erroreInsert.code === '23505') {
        await pool.query(
          `UPDATE "${nomeSchema}".posizione_aggiornata
           SET deliberato = $3, dati = $4, updated_at = now()
           WHERE scenario_id = $1 AND data_riferimento IS NOT DISTINCT FROM $2`,
          [scenarioId, dataRiferimento, deliberato, JSON.stringify(dati)]
        );
        await aggiornaProvenienza(
          'scenario_id = $1 AND data_riferimento IS NOT DISTINCT FROM $2::date',
          [scenarioId, dataRiferimento]
        );
        return { success: true };
      }
      throw erroreInsert;
    }
  } catch (error: any) {
    console.error('[salvaPosizioneAggiornataAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare la posizione aggiornata: ${error.message || error}`,
    };
  }
}

export async function eliminaPosizioneAggiornataAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazionePosizione> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    await verificaRigaConsentita(contesto, 'posizione_aggiornata', id);
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const rigaRis = await pool.query(
      `SELECT scenario_id FROM "${nomeSchema}".posizione_aggiornata WHERE id = $1`,
      [id]
    );
    if (rigaRis.rows.length > 0) {
      const messaggioBloccato = await verificaScenarioNonBloccato(
        nomeSchema,
        rigaRis.rows[0].scenario_id
      );
      if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    }
    await pool.query(`DELETE FROM "${nomeSchema}".posizione_aggiornata WHERE id = $1`, [id]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaPosizioneAggiornataAction] Errore:', error);
    return { success: false, error: `Impossibile eliminare: ${error.message || error}` };
  }
}
