'use server';

// Memoria delle strutture dei prospetti, per ENTE e firma.
//
// La chiave è la coppia, non la sola firma: nello spazio di chi analizza
// arrivano prospetti di più enti, e due tracciati diversi possono avere
// intestazioni simili. Senza l'ente, un estratto INAIL erediterebbe la
// mappatura di un tracciato INPS.

import { pool } from '@/lib/db';
import { assicuraTabellaDebitiEnte } from '@/db/provision';
import type { MappaturaProspetto } from '@/lib/debitiTriage/mappatura';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface StrutturaSalvata {
  ente: string;
  mappatura: MappaturaProspetto;
  volteUsata: number;
}

/** Le strutture già note per questa firma — possono essere di più enti. */
export async function cercaStrutturaProspettoAction(
  nomeSchema: string,
  firma: string
): Promise<{ success: boolean; strutture?: StrutturaSalvata[]; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaDebitiEnte(nomeSchema);
    const r = await pool
      .query(
        `SELECT ente, mappatura, volte_usata FROM "${nomeSchema}".strutture_prospetto
          WHERE firma = $1 ORDER BY volte_usata DESC`,
        [firma]
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    return {
      success: true,
      strutture: r.rows.map((x) => ({
        ente: String(x.ente),
        mappatura: x.mappatura as MappaturaProspetto,
        volteUsata: Number(x.volte_usata ?? 0),
      })),
    };
  } catch (error: unknown) {
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

/**
 * Salva (o aggiorna) la mappatura di un tracciato per un ente.
 *
 * Se la stessa coppia ente+firma esiste già, la mappatura viene SOSTITUITA:
 * è la regola concordata — una struttura nuova fa dimenticare la vecchia.
 * Le righe già importate con la mappatura precedente restano marcate con il
 * proprio prospetto di provenienza, quindi restano distinguibili.
 */
export async function salvaStrutturaProspettoAction(
  nomeSchema: string,
  ente: string,
  firma: string,
  mappatura: MappaturaProspetto,
  nomeRiconosciuto: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!ente || !firma) return { success: false, error: 'Ente e firma sono obbligatori.' };
    await assicuraTabellaDebitiEnte(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".strutture_prospetto
         (ente, firma, nome_riconosciuto, mappatura, volte_usata, ultima_volta)
       VALUES ($1, $2, $3, $4, 1, now())
       ON CONFLICT (ente, firma) DO UPDATE SET
         mappatura = EXCLUDED.mappatura,
         nome_riconosciuto = EXCLUDED.nome_riconosciuto,
         volte_usata = "${nomeSchema}".strutture_prospetto.volte_usata + 1,
         ultima_volta = now()`,
      [ente, firma, nomeRiconosciuto, JSON.stringify(mappatura)]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[salvaStrutturaProspettoAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

/** Registra il prospetto caricato e restituisce l'id da dare alle righe. */
export async function registraProspettoAction(
  nomeSchema: string,
  aziendaId: number,
  nomeFile: string,
  ente: string,
  mappatura: MappaturaProspetto,
  righeImportate: number
): Promise<{ success: boolean; prospettoId?: number; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaDebitiEnte(nomeSchema);
    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".prospetti_triage
         (azienda_id, nome_file, ente, mappatura, righe_importate)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [aziendaId, nomeFile, ente, JSON.stringify(mappatura), righeImportate]
    );
    return { success: true, prospettoId: Number(r.rows[0].id) };
  } catch (error: unknown) {
    return { success: false, error: `Registrazione non riuscita: ${(error as Error).message}` };
  }
}
