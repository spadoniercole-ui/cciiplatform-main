'use server';

// Catalogo dei TRACCIATI della Posizione Debitoria (un formato di file = un
// tracciato). Sostituisce l'architrave unico per spazio: più tracciati
// coesistono, riconosciuti per firma lato client (lib/debitiEnte/
// tracciatoImport). Qui vivono solo persistenza e ciclo di vita.

import { pool } from '@/lib/db';
import { assicuraTabellaTracciatiDebitiEnte, assicuraTabellaDebitiEnte } from '@/db/provision';
import type { Tracciato, RuoloColonna, ClassificazioneModo } from '@/lib/debitiEnte/tracciatoCore';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface RisultatoElencoTracciati {
  success: boolean;
  tracciati: Tracciato[];
  error?: string;
}

function rigaATracciato(r: Record<string, unknown>): Tracciato {
  return {
    id: Number(r.id),
    nome: String(r.nome),
    foglio: String(r.foglio),
    intestazioni: (r.intestazioni as string[]) ?? [],
    ruoli: (r.ruoli as RuoloColonna[]) ?? [],
    classificazioneModo: r.classificazione_modo as ClassificazioneModo,
    tipoFisso: (r.tipo_fisso as string | null) ?? null,
    mappaturaCodici: (r.mappatura_codici as Record<string, string>) ?? {},
    codiciNoti: (r.codici_noti as string[]) ?? [],
    nomeFileOrigine: (r.nome_file_origine as string | null) ?? null,
  };
}

export async function ottieniTracciatiDebitiEnte(
  nomeSchema: string
): Promise<RisultatoElencoTracciati> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, tracciati: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaTracciatiDebitiEnte(nomeSchema);
    const r = await pool.query(
      `SELECT id, nome, foglio, intestazioni, ruoli, classificazione_modo, tipo_fisso,
              mappatura_codici, codici_noti, nome_file_origine
       FROM "${nomeSchema}".debiti_ente_tracciati ORDER BY id ASC`
    );
    return { success: true, tracciati: r.rows.map(rigaATracciato) };
  } catch (error: any) {
    console.error('[ottieniTracciatiDebitiEnte] Errore:', error);
    return {
      success: false,
      tracciati: [],
      error: `Impossibile caricare i tracciati: ${error.message || error}`,
    };
  }
}

export interface DatiNuovoTracciato {
  nome: string;
  foglio: string;
  intestazioni: string[];
  ruoli: RuoloColonna[];
  classificazioneModo: ClassificazioneModo;
  tipoFisso: string | null;
  mappaturaCodici: Record<string, string>;
  codiciNoti: string[];
  firma: string;
  nomeFileOrigine: string | null;
}

export interface RisultatoSalvaTracciato {
  success: boolean;
  id?: number;
  error?: string;
}

export async function salvaTracciatoDebitiEnteAction(
  nomeSchema: string,
  dati: DatiNuovoTracciato
): Promise<RisultatoSalvaTracciato> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!dati.nome.trim())
      return { success: false, error: 'Il nome del tracciato è obbligatorio.' };
    if (!dati.ruoli.includes('importo')) {
      return { success: false, error: 'Indica quale colonna è l’Importo.' };
    }
    if (dati.classificazioneModo === 'colonna_guida' && !dati.ruoli.includes('guida')) {
      return { success: false, error: 'Indica la colonna-guida dei codici da classificare.' };
    }
    if (dati.classificazioneModo === 'tipo_fisso' && !dati.tipoFisso) {
      return { success: false, error: 'Scegli la categoria fissa per l’intera sezione.' };
    }
    await assicuraTabellaTracciatiDebitiEnte(nomeSchema);
    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".debiti_ente_tracciati
         (nome, foglio, intestazioni, ruoli, classificazione_modo, tipo_fisso, mappatura_codici, codici_noti, firma, nome_file_origine)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        dati.nome.trim(),
        dati.foglio,
        JSON.stringify(dati.intestazioni),
        JSON.stringify(dati.ruoli),
        dati.classificazioneModo,
        dati.tipoFisso,
        JSON.stringify(dati.mappaturaCodici),
        JSON.stringify(dati.codiciNoti),
        dati.firma,
        dati.nomeFileOrigine,
      ]
    );
    return { success: true, id: Number(r.rows[0].id) };
  } catch (error: any) {
    console.error('[salvaTracciatoDebitiEnteAction] Errore:', error);
    return { success: false, error: `Impossibile salvare il tracciato: ${error.message || error}` };
  }
}

export interface RisultatoOperazioneTracciato {
  success: boolean;
  error?: string;
}

/**
 * Aggiorna la mappatura dei codici-guida (aggiunge i nuovi mappati
 * dall'operatore) e i codici noti. Usata quando un caricamento porta codici
 * mai visti prima.
 */
export async function aggiornaMappaturaCodiciTracciatoAction(
  nomeSchema: string,
  tracciatoId: number,
  mappaturaCodici: Record<string, string>,
  codiciNoti: string[]
): Promise<RisultatoOperazioneTracciato> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaTracciatiDebitiEnte(nomeSchema);
    await pool.query(
      `UPDATE "${nomeSchema}".debiti_ente_tracciati SET mappatura_codici = $2, codici_noti = $3 WHERE id = $1`,
      [tracciatoId, JSON.stringify(mappaturaCodici), JSON.stringify(codiciNoti)]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaMappaturaCodiciTracciatoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare la mappatura: ${error.message || error}`,
    };
  }
}

/**
 * Elimina un tracciato e TUTTE le righe da esso provenienti (in ogni azienda
 * dello spazio): senza il modello che le descrive quei dati non hanno più
 * senso. Le righe manuali/legacy (tracciato_id NULL) restano intatte. Va
 * confermato lato interfaccia.
 */
export async function eliminaTracciatoDebitiEnteAction(
  nomeSchema: string,
  tracciatoId: number
): Promise<RisultatoOperazioneTracciato> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaDebitiEnte(nomeSchema);
    await assicuraTabellaTracciatiDebitiEnte(nomeSchema);
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_ente WHERE tracciato_id = $1`, [
      tracciatoId,
    ]);
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_ente_tracciati WHERE id = $1`, [
      tracciatoId,
    ]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaTracciatoDebitiEnteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare il tracciato: ${error.message || error}`,
    };
  }
}
