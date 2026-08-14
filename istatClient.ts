'use server';

// Modelli di Check List custom per spazio — oltre alla Ministeriale.
// Stessa struttura (sezioni → domande → peso a 3 livelli) e stesso motore
// di punteggio (calcolaQuadroQualitativo), applicati ad aree/contesti
// diversi (es. per un ente: Vigilanza Documentale, Gestione del Credito,
// Ufficio Legale). Disattivazione invece di cancellazione: se uno
// scenario ha già risposte su un modello, quelle risposte restano
// leggibili anche a modello disattivato.

import { pool } from '@/lib/db';
import { assicuraTabellaChecklistModelli } from '@/db/provision';
import type { SezioneChecklist } from '@/lib/checklist/ministeriale';
import { validaSezioniChecklist } from '@/lib/checklist/validazione';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface ModelloChecklist {
  id: number;
  nome: string;
  descrizione: string | null;
  attivo: boolean;
  sezioni: SezioneChecklist[];
  createdAt: string;
}

export interface RisultatoElencoModelli {
  success: boolean;
  modelli: ModelloChecklist[];
  error?: string;
}

function mappaRigaModello(r: any): ModelloChecklist {
  return {
    id: r.id,
    nome: r.nome,
    descrizione: r.descrizione,
    attivo: r.attivo,
    sezioni: r.sezioni,
    createdAt: r.created_at?.toString?.() ?? String(r.created_at),
  };
}

export async function ottieniModelliChecklist(
  nomeSchema: string,
  includiDisattivati = false
): Promise<RisultatoElencoModelli> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, modelli: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaChecklistModelli(nomeSchema);

    const risultato = await pool.query(
      `SELECT id, nome, descrizione, attivo, sezioni, created_at
       FROM "${nomeSchema}".checklist_modelli
       ${includiDisattivati ? '' : 'WHERE attivo = TRUE'}
       ORDER BY created_at ASC`
    );

    return { success: true, modelli: risultato.rows.map(mappaRigaModello) };
  } catch (error: any) {
    console.error('[ottieniModelliChecklist] Errore:', error);
    return {
      success: false,
      modelli: [],
      error: `Impossibile caricare i modelli: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneModello {
  success: boolean;
  error?: string;
}

export async function creaModelloChecklistAction(
  nomeSchema: string,
  nome: string,
  descrizione: string | null,
  sezioni: SezioneChecklist[]
): Promise<RisultatoOperazioneModello> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!nome.trim()) return { success: false, error: 'Il nome del modello è obbligatorio.' };
    if (!validaSezioniChecklist(sezioni)) {
      return {
        success: false,
        error:
          'Struttura non valida: ogni sezione serve numero, titolo e domande (ciascuna con id, domanda, peso STRUTTURALE/RILEVANTE/DOCUMENTALE).',
      };
    }
    await assicuraTabellaChecklistModelli(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".checklist_modelli (nome, descrizione, sezioni)
       VALUES ($1, $2, $3)`,
      [nome.trim(), descrizione?.trim() || null, JSON.stringify(sezioni)]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[creaModelloChecklistAction] Errore:', error);
    return { success: false, error: `Impossibile creare il modello: ${error.message || error}` };
  }
}

export async function aggiornaModelloChecklistAction(
  nomeSchema: string,
  id: number,
  dati: { nome: string; descrizione: string | null; sezioni: SezioneChecklist[] }
): Promise<RisultatoOperazioneModello> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!dati.nome.trim()) return { success: false, error: 'Il nome del modello è obbligatorio.' };
    if (!validaSezioniChecklist(dati.sezioni)) {
      return {
        success: false,
        error:
          'Struttura non valida: ogni sezione serve numero, titolo e domande (ciascuna con id, domanda, peso STRUTTURALE/RILEVANTE/DOCUMENTALE).',
      };
    }
    await pool.query(
      `UPDATE "${nomeSchema}".checklist_modelli SET nome = $2, descrizione = $3, sezioni = $4 WHERE id = $1`,
      [id, dati.nome.trim(), dati.descrizione?.trim() || null, JSON.stringify(dati.sezioni)]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaModelloChecklistAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare il modello: ${error.message || error}`,
    };
  }
}

export async function impostaStatoModelloAction(
  nomeSchema: string,
  id: number,
  attivo: boolean
): Promise<RisultatoOperazioneModello> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(`UPDATE "${nomeSchema}".checklist_modelli SET attivo = $2 WHERE id = $1`, [
      id,
      attivo,
    ]);
    return { success: true };
  } catch (error: any) {
    console.error('[impostaStatoModelloAction] Errore:', error);
    return { success: false, error: `Impossibile aggiornare lo stato: ${error.message || error}` };
  }
}
