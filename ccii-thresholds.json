'use server';

// Configurazione PER AZIENDA di quali tab XBRL e quali indici si applicano
// a quella specifica azienda — un sottoinsieme di quanto già abilitato a
// livello di spazio (Parametri di Spazio), non un'estensione: se una tab o
// un indice è disabilitato per l'intero spazio, non compare qui da poter
// riabilitare per la singola azienda.
//
// NOTA: qui non si carica nessun file XBRL. Il caricamento avviene
// nello Scenario (che è aziendale) — questa configurazione stabilisce
// solo quali tab e quali indici quel caricamento dovrà alimentare per
// questa azienda, evitando di dover ripetere la scelta a ogni bilancio.

import { pool } from '@/lib/db';
import { assicuraTabelleConfigAzienda } from '@/db/provision';
import { ottieniTabXbrlAbilitate, ottieniIndiciSpazio } from '@/app/actions/parametriSpazio';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface TabXbrlAzienda {
  codice: string;
  etichetta: string;
  abilitato: boolean;
}

export interface RisultatoTabXbrlAzienda {
  success: boolean;
  tab: TabXbrlAzienda[];
  error?: string;
}

export async function ottieniTabXbrlAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoTabXbrlAzienda> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, tab: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabelleConfigAzienda(nomeSchema);

    const [tabSpazio, override] = await Promise.all([
      ottieniTabXbrlAbilitate(nomeSchema),
      pool.query(
        `SELECT tab_codice, abilitato FROM "${nomeSchema}".xbrl_tab_azienda WHERE azienda_id = $1`,
        [aziendaId]
      ),
    ]);
    if (!tabSpazio.success) {
      return { success: false, tab: [], error: tabSpazio.error };
    }

    const mappaOverride = new Map(override.rows.map((r) => [r.tab_codice, r.abilitato]));

    return {
      success: true,
      // Solo le tab già attive per lo spazio: non si può riabilitare qui
      // qualcosa di spento per l'intero spazio.
      tab: tabSpazio.tab
        .filter((t) => t.abilitato)
        .map((t) => ({
          codice: t.codice,
          etichetta: t.etichetta,
          abilitato: mappaOverride.get(t.codice) ?? true,
        })),
    };
  } catch (error: any) {
    console.error('[ottieniTabXbrlAzienda] Errore:', error);
    return {
      success: false,
      tab: [],
      error: `Impossibile caricare la configurazione XBRL dell'azienda: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneConfigAzienda {
  success: boolean;
  error?: string;
}

export async function impostaTabXbrlAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  tabCodice: string,
  abilitato: boolean
): Promise<RisultatoOperazioneConfigAzienda> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleConfigAzienda(nomeSchema);

    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".xbrl_tab_azienda SET abilitato = $3
       WHERE azienda_id = $1 AND tab_codice = $2`,
      [aziendaId, tabCodice, abilitato]
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".xbrl_tab_azienda (azienda_id, tab_codice, abilitato)
         VALUES ($1, $2, $3)`,
        [aziendaId, tabCodice, abilitato]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[impostaTabXbrlAziendaAction] Errore:', error);
    return { success: false, error: `Impossibile aggiornare la tab: ${error.message || error}` };
  }
}

export interface IndiceAzienda {
  id: number;
  codice: string;
  categoria: string;
  nome: string;
  abilitato: boolean;
}

export interface RisultatoIndiciAzienda {
  success: boolean;
  indici: IndiceAzienda[];
  error?: string;
}

export async function ottieniIndiciAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoIndiciAzienda> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, indici: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabelleConfigAzienda(nomeSchema);

    const [indiciSpazio, override] = await Promise.all([
      ottieniIndiciSpazio(nomeSchema),
      pool.query(
        `SELECT indice_id, abilitato FROM "${nomeSchema}".indici_azienda WHERE azienda_id = $1`,
        [aziendaId]
      ),
    ]);
    if (!indiciSpazio.success) {
      return { success: false, indici: [], error: indiciSpazio.error };
    }

    const mappaOverride = new Map(override.rows.map((r) => [r.indice_id, r.abilitato]));

    return {
      success: true,
      // Solo gli indici già attivi per lo spazio.
      indici: indiciSpazio.indici
        .filter((i) => i.abilitato)
        .map((i) => ({
          id: i.id,
          codice: i.codice,
          categoria: i.categoria,
          nome: i.nome,
          abilitato: mappaOverride.get(i.id) ?? true,
        })),
    };
  } catch (error: any) {
    console.error('[ottieniIndiciAzienda] Errore:', error);
    return {
      success: false,
      indici: [],
      error: `Impossibile caricare gli indici dell'azienda: ${error.message || error}`,
    };
  }
}

export async function impostaIndiceAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  indiceId: number,
  abilitato: boolean
): Promise<RisultatoOperazioneConfigAzienda> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleConfigAzienda(nomeSchema);

    // UPDATE-poi-INSERT invece di ON CONFLICT: non dipende dal fatto che
    // il vincolo univoco (azienda_id, indice_id) sia esattamente quello
    // che Postgres si aspetta per risolvere un ON CONFLICT — più robusto
    // se la tabella è stata creata da una versione precedente del codice.
    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".indici_azienda SET abilitato = $3
       WHERE azienda_id = $1 AND indice_id = $2`,
      [aziendaId, indiceId, abilitato]
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".indici_azienda (azienda_id, indice_id, abilitato)
         VALUES ($1, $2, $3)`,
        [aziendaId, indiceId, abilitato]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[impostaIndiceAziendaAction] Errore:', error);
    return { success: false, error: `Impossibile aggiornare l'indice: ${error.message || error}` };
  }
}
