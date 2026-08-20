'use server';

// Posizione Debitoria dell'Ente — a livello di AZIENDA, non di
// scenario: quello che l'ente dichiara di avere a credito verso
// un'azienda secondo la propria contabilità non cambia da una
// proposta all'altra della stessa azienda. Stesso sistema di
// caricamento della Proposta (stessa UI, stesso export/import Excel),
// ma dati e tabella diversi.

import { pool } from '@/lib/db';
import { assicuraTabellaDebitiEnte } from '@/db/provision';
import type { TipoDebitoEnte } from '@/lib/debitiEnte/tipoDebito';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface RigaDebitoEnte {
  id: number;
  aziendaId: number;
  voce: string;
  importo: number;
  /** Opzionale — solo se lo schema del file distingue debito originario da quanto già pagato. null = nessuna distinzione, il saldo coincide con l'importo. */
  importoVersato: number | null;
  tipo: TipoDebitoEnte;
  note: string | null;
  /** Opzionale — generica (scadenza, notifica, emissione: il significato lo sa chi ha configurato l'architrave). */
  data: string | null;
  /** Colonne extra mappate dall'operatore (chiave = intestazione originale del file). null/vuoto se nessuna. */
  datiExtra: Record<string, string> | null;
}

export interface DatiRigaDebitoEnte {
  voce: string;
  importo: number;
  importoVersato: number | null;
  tipo: TipoDebitoEnte;
  note: string | null;
  data: string | null;
  /** Colonne extra (chiave = intestazione originale). Opzionale: l'inserimento manuale non ne ha. */
  datiExtra?: Record<string, string> | null;
}

export interface RisultatoElencoDebitiEnte {
  success: boolean;
  righe: RigaDebitoEnte[];
  error?: string;
}

export async function ottieniDebitiEnte(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoElencoDebitiEnte> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, righe: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaDebitiEnte(nomeSchema);

    const risultato = await pool.query(
      `SELECT id, azienda_id, voce, importo, importo_versato, tipo, note, data, dati_extra
       FROM "${nomeSchema}".debiti_ente WHERE azienda_id = $1 ORDER BY id ASC`,
      [aziendaId]
    );

    return {
      success: true,
      righe: risultato.rows.map((r) => ({
        id: r.id,
        aziendaId: r.azienda_id,
        voce: r.voce,
        importo: Number(r.importo),
        importoVersato: r.importo_versato === null ? null : Number(r.importo_versato),
        tipo: r.tipo as TipoDebitoEnte,
        note: r.note,
        data: r.data ? new Date(r.data).toISOString().slice(0, 10) : null,
        datiExtra:
          r.dati_extra && typeof r.dati_extra === 'object' && Object.keys(r.dati_extra).length > 0
            ? (r.dati_extra as Record<string, string>)
            : null,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniDebitiEnte] Errore:', error);
    return {
      success: false,
      righe: [],
      error: `Impossibile caricare la posizione debitoria: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneDebitoEnte {
  success: boolean;
  error?: string;
}

export async function aggiungiRigaDebitoEnteAction(
  nomeSchema: string,
  aziendaId: number,
  dati: DatiRigaDebitoEnte
): Promise<RisultatoOperazioneDebitoEnte> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!dati.voce.trim()) {
      return { success: false, error: 'La voce di debito è obbligatoria.' };
    }
    if (dati.importo < 0) {
      return { success: false, error: "L'importo non può essere negativo." };
    }
    await assicuraTabellaDebitiEnte(nomeSchema);
    const datiExtra =
      dati.datiExtra && Object.keys(dati.datiExtra).length > 0
        ? JSON.stringify(dati.datiExtra)
        : null;
    await pool.query(
      `INSERT INTO "${nomeSchema}".debiti_ente (azienda_id, voce, importo, importo_versato, tipo, note, data, dati_extra)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        aziendaId,
        dati.voce.trim(),
        dati.importo,
        dati.importoVersato,
        dati.tipo,
        dati.note,
        dati.data,
        datiExtra,
      ]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiungiRigaDebitoEnteAction] Errore:', error);
    return { success: false, error: `Impossibile aggiungere la riga: ${error.message || error}` };
  }
}

export async function modificaRigaDebitoEnteAction(
  nomeSchema: string,
  id: number,
  dati: DatiRigaDebitoEnte
): Promise<RisultatoOperazioneDebitoEnte> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!dati.voce.trim()) {
      return { success: false, error: 'La voce di debito è obbligatoria.' };
    }
    await pool.query(
      `UPDATE "${nomeSchema}".debiti_ente SET voce = $2, importo = $3, importo_versato = $4, tipo = $5, note = $6, data = $7 WHERE id = $1`,
      [id, dati.voce.trim(), dati.importo, dati.importoVersato, dati.tipo, dati.note, dati.data]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[modificaRigaDebitoEnteAction] Errore:', error);
    return { success: false, error: `Impossibile modificare la riga: ${error.message || error}` };
  }
}

export async function eliminaRigaDebitoEnteAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneDebitoEnte> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_ente WHERE id = $1`, [id]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaRigaDebitoEnteAction] Errore:', error);
    return { success: false, error: `Impossibile eliminare la riga: ${error.message || error}` };
  }
}

/** Elimina TUTTE le righe di un'azienda — usata prima di un reimport Excel, stesso principio già in uso per la Proposta. */
export async function eliminaTuttiDebitiEnteAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoOperazioneDebitoEnte> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_ente WHERE azienda_id = $1`, [aziendaId]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaTuttiDebitiEnteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare le righe esistenti: ${error.message || error}`,
    };
  }
}
