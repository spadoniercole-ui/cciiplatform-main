'use server';

// Sblocco tracciato di uno scenario bloccato — solo Admin di Spazio,
// solo con un motivo dichiarato. Ogni sblocco resta in cronologia,
// così come ogni versione della Relazione generata: sbloccare per
// correggere un errore non deve mai far sparire quello che c'era
// prima, specialmente se già mostrato o consegnato a un ente
// creditore.

import { richiediAccessoScenario } from '@/lib/autorizzazione';
import { pool } from '@/lib/db';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface VersioneRelazione {
  numeroVersione: number;
  testo: string;
  generataIl: string;
}

export interface SbloccoScenario {
  motivo: string;
  sbloccatoDa: string | null;
  sbloccatoIl: string;
}

export interface RisultatoOperazioneSblocco {
  success: boolean;
  error?: string;
}

/** Solo Admin di Spazio, mai un Operatore — verificato qui dalla guardia
 * (soloAdmin). Il parametro `sbloccatoDa` è usato solo dal Superadmin in
 * ispezione, che non ha un'email di sessione. Il motivo è obbligatorio:
 * uno sblocco senza spiegazione non aiuta nessuno che riguardi lo
 * scenario più avanti. */
export async function sbloccaScenarioAction(
  nomeSchema: string,
  scenarioId: number,
  motivo: string,
  sbloccatoDa: string | null
): Promise<RisultatoOperazioneSblocco> {
  try {
    const contesto = await richiediAccessoScenario(nomeSchema, scenarioId, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!motivo.trim()) {
      return { success: false, error: 'Indica un motivo per lo sblocco.' };
    }
    // Chi sblocca viene dalla sessione, non dal browser: la traccia non è
    // falsificabile. Solo il Superadmin in ispezione non ha un'email.
    const autore = contesto.email ?? (contesto.modalita === 'SALVAGENTE' ? sbloccatoDa : null);
    await pool.query(
      `INSERT INTO "${nomeSchema}".scenario_sblocchi (scenario_id, motivo, sbloccato_da)
       VALUES ($1, $2, $3)`,
      [scenarioId, motivo.trim(), autore]
    );
    await pool.query(`UPDATE "${nomeSchema}".scenari SET bloccato_il = NULL WHERE id = $1`, [
      scenarioId,
    ]);
    return { success: true };
  } catch (error: any) {
    console.error('[sbloccaScenarioAction] Errore:', error);
    return { success: false, error: `Impossibile sbloccare: ${error.message || error}` };
  }
}

export async function ottieniStoricoSblocchi(
  nomeSchema: string,
  scenarioId: number
): Promise<{ success: boolean; sblocchi: SbloccoScenario[]; error?: string }> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!validaSchema(nomeSchema)) {
      return { success: false, sblocchi: [], error: 'Nome schema non valido.' };
    }
    const risultato = await pool.query(
      `SELECT motivo, sbloccato_da, sbloccato_il FROM "${nomeSchema}".scenario_sblocchi
       WHERE scenario_id = $1 ORDER BY sbloccato_il DESC`,
      [scenarioId]
    );
    return {
      success: true,
      sblocchi: risultato.rows.map((r) => ({
        motivo: r.motivo,
        sbloccatoDa: r.sbloccato_da,
        sbloccatoIl: r.sbloccato_il.toString(),
      })),
    };
  } catch (error: any) {
    console.error('[ottieniStoricoSblocchi] Errore:', error);
    return {
      success: false,
      sblocchi: [],
      error: `Impossibile leggere: ${error.message || error}`,
    };
  }
}

/** Salva una nuova versione della Relazione — mai un UPDATE, sempre un
 * nuovo numero di versione. Chiamata da generaRelazionePropostaAction
 * subito dopo che l'AI ha risposto. */
export async function salvaVersioneRelazioneAction(
  nomeSchema: string,
  scenarioId: number,
  testo: string
): Promise<{ success: boolean; numeroVersione?: number; error?: string }> {
  try {
    // Stessi requisiti del chiamante (generaRelazionePropostaAction).
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['relazione'],
      livello: 'SCRITTURA',
    });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const contatoreRis = await pool.query(
      `SELECT COALESCE(MAX(numero_versione), 0) + 1 AS prossimo
       FROM "${nomeSchema}".relazione_generazioni WHERE scenario_id = $1`,
      [scenarioId]
    );
    const numeroVersione = Number(contatoreRis.rows[0].prossimo);
    await pool.query(
      `INSERT INTO "${nomeSchema}".relazione_generazioni (scenario_id, numero_versione, testo)
       VALUES ($1, $2, $3)`,
      [scenarioId, numeroVersione, testo]
    );
    return { success: true, numeroVersione };
  } catch (error: any) {
    console.error('[salvaVersioneRelazioneAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare la versione: ${error.message || error}`,
    };
  }
}

export async function ottieniStoricoRelazioni(
  nomeSchema: string,
  scenarioId: number
): Promise<{ success: boolean; versioni: VersioneRelazione[]; error?: string }> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!validaSchema(nomeSchema)) {
      return { success: false, versioni: [], error: 'Nome schema non valido.' };
    }
    const risultato = await pool.query(
      `SELECT numero_versione, testo, generata_il FROM "${nomeSchema}".relazione_generazioni
       WHERE scenario_id = $1 ORDER BY numero_versione DESC`,
      [scenarioId]
    );
    return {
      success: true,
      versioni: risultato.rows.map((r) => ({
        numeroVersione: r.numero_versione,
        testo: r.testo,
        generataIl: r.generata_il.toString(),
      })),
    };
  } catch (error: any) {
    console.error('[ottieniStoricoRelazioni] Errore:', error);
    return {
      success: false,
      versioni: [],
      error: `Impossibile leggere: ${error.message || error}`,
    };
  }
}
