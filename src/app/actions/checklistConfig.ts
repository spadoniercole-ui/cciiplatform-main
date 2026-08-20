'use server';

// Configurazione dei pesi della Check List (Strutturale/Rilevante/
// Documentale), per spazio. La STRUTTURA (sezioni/domande) di partenza
// non è più la costante CHECKLIST_MINISTERIALE letta "in diretta": è una
// foto scattata al primo accesso di questo spazio (vedi
// checklist_ministeriale_snapshot in provision.ts) del modello base
// governato dal superadmin (checklistModelloBase.ts). Così, se il
// superadmin modifica il modello base in seguito, cambia solo il seme
// per gli spazi che non hanno ancora scattato la foto — quelli che
// l'hanno già fatto restano com'erano, come richiesto esplicitamente.

import { pool } from '@/lib/db';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import { ottieniModelloBase } from '@/app/actions/checklistModelloBase';
import {
  PESO_NUMERICO,
  type PesoDomanda,
  type SezioneChecklist,
} from '@/lib/checklist/ministeriale';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

/** Restituisce la struttura Ministeriale di QUESTO spazio: se non ha ancora scattato la foto, la scatta ora dal modello base corrente. */
async function ottieniSezioniMinisterialiPerSpazio(
  nomeSchema: string
): Promise<SezioneChecklist[]> {
  const esistente = await pool.query(
    `SELECT sezioni FROM "${nomeSchema}".checklist_ministeriale_snapshot WHERE id = 1`
  );
  if (esistente.rows.length > 0) {
    return esistente.rows[0].sezioni;
  }
  const base = await ottieniModelloBase();
  await pool.query(
    `INSERT INTO "${nomeSchema}".checklist_ministeriale_snapshot (id, sezioni) VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(base.sezioni)]
  );
  return base.sezioni;
}

export interface ValoriPesoNumerico {
  STRUTTURALE: number;
  RILEVANTE: number;
  DOCUMENTALE: number;
}

export interface SoglieSintesi {
  solido: number;
  daRafforzare: number;
}

export interface ConfigurazioneChecklist {
  sezioni: SezioneChecklist[]; // con i pesi effettivi (default + eventuali override) già applicati
  domandeConOverride: string[]; // id delle domande il cui peso è stato cambiato rispetto al default
  pesiNumerici: ValoriPesoNumerico;
  soglie: SoglieSintesi;
}

export interface RisultatoConfigurazione {
  success: boolean;
  configurazione?: ConfigurazioneChecklist;
  error?: string;
}

type ChiaveNumerica =
  | 'PESO_STRUTTURALE'
  | 'PESO_RILEVANTE'
  | 'PESO_DOCUMENTALE'
  | 'SOGLIA_SOLIDO'
  | 'SOGLIA_DA_RAFFORZARE';

export async function ottieniConfigurazioneChecklist(
  nomeSchema: string
): Promise<RisultatoConfigurazione> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);

    const sezioniBase = await ottieniSezioniMinisterialiPerSpazio(nomeSchema);

    const overrideRisultato = await pool.query(
      `SELECT domanda_id, peso FROM "${nomeSchema}".checklist_pesi_domande`
    );
    const overrideMappa: Record<string, PesoDomanda> = {};
    for (const riga of overrideRisultato.rows) {
      overrideMappa[riga.domanda_id] = riga.peso as PesoDomanda;
    }

    const sezioni: SezioneChecklist[] = sezioniBase.map((sezione) => ({
      ...sezione,
      domande: sezione.domande.map((d) => ({
        ...d,
        peso: overrideMappa[d.id] || d.peso,
      })),
    }));

    const configRisultato = await pool.query(
      `SELECT chiave, valore FROM "${nomeSchema}".checklist_config_pesi`
    );
    const configMappa: Record<string, number> = {};
    for (const riga of configRisultato.rows) {
      configMappa[riga.chiave] = riga.valore;
    }

    return {
      success: true,
      configurazione: {
        sezioni,
        domandeConOverride: Object.keys(overrideMappa),
        pesiNumerici: {
          STRUTTURALE: configMappa.PESO_STRUTTURALE ?? PESO_NUMERICO.STRUTTURALE,
          RILEVANTE: configMappa.PESO_RILEVANTE ?? PESO_NUMERICO.RILEVANTE,
          DOCUMENTALE: configMappa.PESO_DOCUMENTALE ?? PESO_NUMERICO.DOCUMENTALE,
        },
        soglie: {
          solido: configMappa.SOGLIA_SOLIDO ?? 20,
          daRafforzare: configMappa.SOGLIA_DA_RAFFORZARE ?? 50,
        },
      },
    };
  } catch (error: any) {
    console.error('[ottieniConfigurazioneChecklist] Errore:', error);
    return {
      success: false,
      error: `Impossibile caricare la configurazione: ${error.message || error}`,
    };
  }
}

export interface RisultatoSalvataggioConfig {
  success: boolean;
  error?: string;
}

export async function aggiornaPesoDomandaAction(
  nomeSchema: string,
  domandaId: string,
  peso: PesoDomanda
): Promise<RisultatoSalvataggioConfig> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);

    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".checklist_pesi_domande SET peso = $2, updated_at = now()
       WHERE domanda_id = $1`,
      [domandaId, peso]
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".checklist_pesi_domande (domanda_id, peso, updated_at)
         VALUES ($1, $2, now())`,
        [domandaId, peso]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaPesoDomandaAction] Errore:', error);
    return { success: false, error: `Impossibile salvare il peso: ${error.message || error}` };
  }
}

/** Ripristina il peso di default (elimina l'override) per una domanda. */
export async function ripristinaPesoDefaultAction(
  nomeSchema: string,
  domandaId: string
): Promise<RisultatoSalvataggioConfig> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(`DELETE FROM "${nomeSchema}".checklist_pesi_domande WHERE domanda_id = $1`, [
      domandaId,
    ]);
    return { success: true };
  } catch (error: any) {
    console.error('[ripristinaPesoDefaultAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile ripristinare il default: ${error.message || error}`,
    };
  }
}

export async function aggiornaParametroNumericoAction(
  nomeSchema: string,
  chiave: ChiaveNumerica,
  valore: number
): Promise<RisultatoSalvataggioConfig> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);

    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".checklist_config_pesi SET valore = $2 WHERE chiave = $1`,
      [chiave, valore]
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".checklist_config_pesi (chiave, valore) VALUES ($1, $2)`,
        [chiave, valore]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaParametroNumericoAction] Errore:', error);
    return { success: false, error: `Impossibile salvare il parametro: ${error.message || error}` };
  }
}
