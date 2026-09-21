'use server';

// Lettura e scrittura delle posizioni debitorie raccolte nel triage.
//
// Le righe sono generiche: categoria, tre anni, e il termine di paragone che
// la soglia di quella categoria richiede. Non sanno da dove provengono — un
// prospetto caricato o l'imputazione a mano — ed è questo che permette di
// aggiungere un ente senza toccare il motore.

import { pool } from '@/lib/db';
import { assicuraTabellaDebitiEnte } from '@/db/provision';
import type { CategoriaDebito, RigaDebitoTriage } from '@/lib/debitiTriage/modello';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export interface RisultatoRighe {
  success: boolean;
  righe?: RigaDebitoTriage[];
  error?: string;
}

export async function ottieniDebitiTriageAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoRighe> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaDebitiEnte(nomeSchema);
    const r = await pool
      .query(
        `SELECT id, descrizione, categoria, importo_anno_corrente, importo_anno_precedente,
                importo_anno_meno2, riferimento_anno_precedente, prospetto_id
           FROM "${nomeSchema}".debiti_triage
          WHERE azienda_id = $1 ORDER BY categoria, id`,
        [aziendaId]
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    return {
      success: true,
      righe: r.rows.map((x) => ({
        id: Number(x.id),
        descrizione: String(x.descrizione),
        categoria: String(x.categoria) as CategoriaDebito,
        importoAnnoCorrente: num(x.importo_anno_corrente),
        importoAnnoPrecedente: num(x.importo_anno_precedente),
        importoAnnoMeno2: num(x.importo_anno_meno2),
        riferimentoAnnoPrecedente: num(x.riferimento_anno_precedente),
        prospettoId: x.prospetto_id === null ? null : Number(x.prospetto_id),
      })),
    };
  } catch (error: unknown) {
    console.error('[ottieniDebitiTriageAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

/**
 * Sostituisce le righe di provenienza indicata.
 *
 * `prospettoId` null sostituisce SOLO quelle inserite a mano; un id
 * sostituisce solo quelle di quel prospetto. Così ricaricare un prospetto non
 * cancella il lavoro fatto a mano, e viceversa: due provenienze diverse non
 * si sovrascrivono a vicenda senza che nessuno l'abbia chiesto.
 */
export async function salvaDebitiTriageAction(
  nomeSchema: string,
  aziendaId: number,
  righe: RigaDebitoTriage[],
  prospettoId: number | null
): Promise<{ success: boolean; salvate?: number; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaDebitiEnte(nomeSchema);

    await pool.query(
      `DELETE FROM "${nomeSchema}".debiti_triage
        WHERE azienda_id = $1
          AND ${prospettoId === null ? 'prospetto_id IS NULL' : 'prospetto_id = $2'}`,
      prospettoId === null ? [aziendaId] : [aziendaId, prospettoId]
    );

    let salvate = 0;
    for (const r of righe) {
      // Una riga senza descrizione né importi è una riga vuota lasciata dal
      // form: non va salvata, altrimenti l'elenco si riempie di nulla.
      const vuota =
        r.descrizione.trim() === '' &&
        r.importoAnnoCorrente === null &&
        r.importoAnnoPrecedente === null &&
        r.importoAnnoMeno2 === null;
      if (vuota) continue;
      await pool.query(
        `INSERT INTO "${nomeSchema}".debiti_triage
           (azienda_id, descrizione, categoria, importo_anno_corrente,
            importo_anno_precedente, importo_anno_meno2, riferimento_anno_precedente, prospetto_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          aziendaId,
          r.descrizione.trim() || '(senza descrizione)',
          r.categoria,
          r.importoAnnoCorrente,
          r.importoAnnoPrecedente,
          r.importoAnnoMeno2,
          r.riferimentoAnnoPrecedente,
          prospettoId,
        ]
      );
      salvate++;
    }
    return { success: true, salvate };
  } catch (error: unknown) {
    console.error('[salvaDebitiTriageAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

export async function eliminaRigaDebitoTriageAction(
  nomeSchema: string,
  rigaId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_triage WHERE id = $1`, [rigaId]);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: `Eliminazione non riuscita: ${(error as Error).message}` };
  }
}

/**
 * Sostituisce TUTTE le posizioni dell'azienda con quelle della tabella.
 *
 * La tabella è l'unica superficie dove le posizioni si vedono e si
 * correggono — quelle a mano e quelle estratte dai prospetti insieme. Ciò che
 * si vede è ciò che si salva. Ogni riga conserva il proprio `prospetto_id`,
 * quindi la provenienza resta tracciabile anche dopo la sostituzione.
 */
export async function salvaTutteDebitiTriageAction(
  nomeSchema: string,
  aziendaId: number,
  righe: RigaDebitoTriage[]
): Promise<{ success: boolean; salvate?: number; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaDebitiEnte(nomeSchema);
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_triage WHERE azienda_id = $1`, [
      aziendaId,
    ]);
    let salvate = 0;
    for (const r of righe) {
      const vuota =
        r.descrizione.trim() === '' &&
        r.importoAnnoCorrente === null &&
        r.importoAnnoPrecedente === null &&
        r.importoAnnoMeno2 === null;
      if (vuota) continue;
      await pool.query(
        `INSERT INTO "${nomeSchema}".debiti_triage
           (azienda_id, descrizione, categoria, importo_anno_corrente,
            importo_anno_precedente, importo_anno_meno2, riferimento_anno_precedente, prospetto_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          aziendaId,
          r.descrizione.trim() || '(senza descrizione)',
          r.categoria,
          r.importoAnnoCorrente,
          r.importoAnnoPrecedente,
          r.importoAnnoMeno2,
          r.riferimentoAnnoPrecedente,
          r.prospettoId,
        ]
      );
      salvate++;
    }
    return { success: true, salvate };
  } catch (error: unknown) {
    console.error('[salvaTutteDebitiTriageAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}
