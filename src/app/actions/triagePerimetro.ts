'use server';

// LA CHECK DI PERIMETRO DEL TRIAGE — lettura, salvataggio e rango del credito.
//
// La check nasce dai titoli: le voci sono le TL contrassegnate come rilevanti,
// con i codici che cadono nella loro materia. L'operatore risponde stato,
// natura e nota; il salvataggio conserva le risposte e non cancella quelle
// delle TL che nel frattempo hanno perso il contrassegno (restano, ma non
// entrano più nel calcolo: se il contrassegno torna, la risposta è ancora lì).
//
// Solo Admin di spazio, come le altre funzioni del triage: la pagina è già
// riservata, la guardia non si fida della pagina.

import { pool } from '@/lib/db';
import { richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleScenariTriage } from '@/db/provision';
import {
  applicaRisposte,
  mancanze,
  sintesiPerimetro,
  vociObbligatorie,
  type LavorazionePerimetro,
  type NaturaProblema,
  type StatoPerimetro,
  type VersoPerimetro,
  type VocePerimetro,
} from '@/lib/triage/perimetro';
import type { RangoCredito } from '@/lib/triage/scenari';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

const STATI: StatoPerimetro[] = ['RISCONTRATA', 'NON_RISCONTRATA', 'NON_APPLICABILE'];
const NATURE: NaturaProblema[] = ['MOMENTANEO', 'MODUS_OPERANDI', 'NON_VALUTABILE'];
const VERSI: VersoPerimetro[] = ['COLLABORATIVA', 'RESISTENZA'];

export interface RisultatoPerimetro {
  success: boolean;
  voci?: VocePerimetro[];
  completa?: boolean;
  mancanze?: string[];
  sintesi?: ReturnType<typeof sintesiPerimetro>;
  error?: string;
}

export async function ottieniPerimetroTriageAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoPerimetro> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    await assicuraTabelleScenariTriage(nomeSchema);

    const [lavorazioni, titoli, risposte] = await Promise.all([
      pool.query(
        `SELECT l.id, l.materia_id, l.tipologia, l.dipendenza,
                l.rilevante_perimetro, l.verso_perimetro,
                m.nome AS materia
           FROM "${nomeSchema}".materie_lavorazione l
           LEFT JOIN "${nomeSchema}".materie_ente m ON m.id = l.materia_id
          ORDER BY m.nome, l.ordine, l.id`
      ),
      pool.query(`SELECT codice, materia_id FROM "${nomeSchema}".titoli_ente ORDER BY codice`),
      pool
        .query(
          `SELECT lavorazione_id, stato, natura, nota
             FROM "${nomeSchema}".triage_perimetro
            WHERE azienda_id = $1`,
          [aziendaId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);

    const configurate: LavorazionePerimetro[] = lavorazioni.rows.map((x) => ({
      id: Number(x.id),
      materiaId: Number(x.materia_id),
      materia: (x.materia as string | null) ?? null,
      tipologia: String(x.tipologia ?? ''),
      dipendenza: (x.dipendenza as string | null) ?? null,
      rilevantePerimetro: x.rilevante_perimetro === true,
      versoPerimetro: VERSI.includes(x.verso_perimetro as VersoPerimetro)
        ? (x.verso_perimetro as VersoPerimetro)
        : null,
    }));

    const voci = applicaRisposte(
      vociObbligatorie(
        titoli.rows.map((x) => ({
          codice: String(x.codice),
          materiaId: x.materia_id === null ? null : Number(x.materia_id),
        })),
        configurate
      ),
      risposte.rows.map((x) => ({
        lavorazioneId: Number(x.lavorazione_id),
        stato: STATI.includes(x.stato as StatoPerimetro) ? (x.stato as StatoPerimetro) : null,
        natura: NATURE.includes(x.natura as NaturaProblema) ? (x.natura as NaturaProblema) : null,
        nota: (x.nota as string | null) ?? null,
      }))
    );

    return {
      success: true,
      voci,
      completa: mancanze(voci).length === 0 && voci.length > 0,
      mancanze: mancanze(voci),
      sintesi: sintesiPerimetro(voci),
    };
  } catch (error: unknown) {
    console.error('[ottieniPerimetroTriageAction] Errore:', error);
    return {
      success: false,
      error: `Lettura della check non riuscita: ${(error as Error).message}`,
    };
  }
}

/**
 * Salva le risposte. Non rifiuta una check incompleta: l'operatore può
 * interrompere e riprendere. È il triage a decidere di non chiudersi finché
 * `completa` è falso, e a dirlo con le mancanze esatte.
 */
export async function salvaPerimetroTriageAction(
  nomeSchema: string,
  aziendaId: number,
  voci: Pick<VocePerimetro, 'lavorazioneId' | 'stato' | 'natura' | 'nota'>[]
): Promise<RisultatoPerimetro> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    await assicuraTabelleScenariTriage(nomeSchema);

    for (const v of voci) {
      if (!Number.isInteger(v.lavorazioneId) || v.lavorazioneId <= 0)
        return { success: false, error: 'Lavorazione non valida.' };
      if (v.stato !== null && !STATI.includes(v.stato))
        return { success: false, error: 'Stato della check non riconosciuto.' };
      if (v.natura !== null && !NATURE.includes(v.natura))
        return { success: false, error: 'Natura della problematica non riconosciuta.' };
      if (v.nota !== null && v.nota.length > 500)
        return { success: false, error: 'La nota non può superare 500 caratteri.' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const v of voci) {
        // Una voce senza stato non ha nulla da conservare: si toglie la riga,
        // così «non risposto» resta distinto da «risposto vuoto».
        if (!v.stato) {
          await client.query(
            `DELETE FROM "${nomeSchema}".triage_perimetro
              WHERE azienda_id = $1 AND lavorazione_id = $2`,
            [aziendaId, v.lavorazioneId]
          );
          continue;
        }
        await client.query(
          `INSERT INTO "${nomeSchema}".triage_perimetro
             (azienda_id, lavorazione_id, stato, natura, nota, aggiornato_il)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (azienda_id, lavorazione_id)
           DO UPDATE SET stato = $3, natura = $4, nota = $5, aggiornato_il = now()`,
          [aziendaId, v.lavorazioneId, v.stato, v.natura, v.nota]
        );
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    return await ottieniPerimetroTriageAction(nomeSchema, aziendaId);
  } catch (error: unknown) {
    console.error('[salvaPerimetroTriageAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

export interface RisultatoRango {
  success: boolean;
  rango?: RangoCredito | null;
  error?: string;
}

/** Il rango del credito dell'ente: è una scelta per azienda, non un default. */
export async function ottieniRangoCreditoAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoRango> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    await assicuraTabelleScenariTriage(nomeSchema);
    const r = await pool.query(
      `SELECT rango FROM "${nomeSchema}".triage_scenario WHERE azienda_id = $1`,
      [aziendaId]
    );
    return { success: true, rango: (r.rows[0]?.rango as RangoCredito) ?? null };
  } catch (error: unknown) {
    console.error('[ottieniRangoCreditoAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export async function salvaRangoCreditoAction(
  nomeSchema: string,
  aziendaId: number,
  rango: RangoCredito | null
): Promise<RisultatoRango> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    await assicuraTabelleScenariTriage(nomeSchema);
    const ammessi: RangoCredito[] = [
      'PREDEDUCIBILE',
      'PRIVILEGIATO',
      'CHIROGRAFARIO',
      'POSTERGATO',
    ];
    if (rango !== null && !ammessi.includes(rango))
      return { success: false, error: 'Rango non riconosciuto.' };
    if (rango === null) {
      await pool.query(`DELETE FROM "${nomeSchema}".triage_scenario WHERE azienda_id = $1`, [
        aziendaId,
      ]);
    } else {
      await pool.query(
        `INSERT INTO "${nomeSchema}".triage_scenario (azienda_id, rango, aggiornato_il)
         VALUES ($1, $2, now())
         ON CONFLICT (azienda_id) DO UPDATE SET rango = $2, aggiornato_il = now()`,
        [aziendaId, rango]
      );
    }
    return { success: true, rango };
  } catch (error: unknown) {
    console.error('[salvaRangoCreditoAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}
