'use server';

// VERIFICA AZIENDA — la fotografia dell'azienda e i tre scenari sul credito.
//
// Non c'è più una seconda simulazione (0.240.0). I profili (standard,
// migliorativo, peggiorativo) e l'orizzonte scelto a mano rifacevano qui il
// calcolo che appartiene alla verifica contabile, con il rischio di due motori
// che dicono numeri diversi sugli stessi bilanci. Ora la scheda legge il
// prospetto contabile già proiettato — depositati più annualità costruite fino
// all'anno della verifica — e ci mette sopra tre scenari:
//
//   accordo transattivo   capacità di risposta dell'azienda al credito vantato
//   liquidazione          credito × tasso di realizzo del rango, meno le spese
//   cram down             credito × percentuale di soddisfacimento del rango
//
// Le due percentuali vengono da `parametri_scenari_rango` (le fissa l'ente),
// il rango dal triage dell'azienda, il credito dalla verifica amministrativa.
// Se un pezzo manca lo scenario si dichiara non calcolabile: niente zero
// inventati. La logica pura sta in src/lib/verificaAzienda/fotografia.ts; qui
// si autorizza, si legge e si conserva.
//
// La LETTURA sta in `src/lib/verificaAzienda/letturaVerifica.ts` (0.242.0):
// anche la pagina della Posizione compone la stessa fotografia, e due copie
// della stessa lettura sarebbero di nuovo due motori.

import { pool } from '@/lib/db';
import { leggiSessione, richiediAccessoAzienda } from '@/lib/autorizzazione';
import { nomeDaSessione } from '@/lib/identitaSessione';
import { apriVerifica } from '@/lib/verificheApertura';
import { assicuraTabelleVerificaAzienda } from '@/db/provision';
import { leggiVerificaAzienda } from '@/lib/verificaAzienda/letturaVerifica';
import type { FotografiaVerificaAzienda } from '@/lib/verificaAzienda/fotografia';
import type {
  AsseContabileVerificaAzienda,
  DebitoVerificaAzienda,
  RiepilogoNota,
} from '@/lib/verificaAzienda/letturaVerifica';

export type { AsseContabileVerificaAzienda, DebitoVerificaAzienda, RiepilogoNota };

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface RisultatoSimulazioneBase {
  success: boolean;
  base: {
    id: number;
    profilo: string;
    annualita: number;
    createdAt: string;
  } | null;
  error?: string;
}

export interface RisultatoVerificaAzienda {
  success: boolean;
  fotografia?: FotografiaVerificaAzienda;
  debito?: DebitoVerificaAzienda | null;
  /** La riga salvata come possibile base degli scenari (ScenariManager la legge). */
  fotografiaId?: number;
  /** Nota integrativa dell'ultimo bilancio: contesto, non un tasso. */
  nota?: RiepilogoNota | null;
  /** L'asse temporale della contabile: base, ultimo bilancio, anno della verifica. */
  asse?: AsseContabileVerificaAzienda;
  error?: string;
}

/**
 * La fotografia dell'azienda alla data della verifica, con i tre scenari.
 *
 * Non proietta nulla: legge il prospetto contabile già costruito e lo mostra.
 * Salva la riga che ScenariManager legge come base della verifica aziendale —
 * profilo «FOTOGRAFIA», colonne = gli anni del prospetto — così l'apertura di
 * uno scenario continua a funzionare come prima.
 */
export async function calcolaVerificaAziendaAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoVerificaAzienda> {
  try {
    const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, error: 'Azienda non riconosciuta.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);

    // La verifica azienda ha la sua data d'apertura, come la contabile: la
    // prima lettura la fissa, le successive la leggono. Serve a sapere con
    // quali criteri è stata fatta la prima fotografia.
    await apriVerifica(nomeSchema, aziendaId, 'AZIENDALE', {
      nome: nomeDaSessione(await leggiSessione()) ?? '',
      id: contesto.adminId ?? contesto.utenteId ?? null,
      modalita: contesto.modalita,
    }).catch(() => undefined);

    const lettura = await leggiVerificaAzienda(nomeSchema, aziendaId);

    let fotografiaId: number | undefined;
    if (lettura.fotografia.anni.length > 0) {
      const inserita = await pool.query(
        `INSERT INTO "${nomeSchema}".verifica_azienda_simulazioni
           (azienda_id, profilo, annualita, debito_ente, crescita_storica_pct,
            crescita_applicata_pct, colonne, avvertenze)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          aziendaId,
          'FOTOGRAFIA',
          lettura.fotografia.anni.length,
          lettura.fotografia.credito ?? 0,
          null,
          // La fotografia non ha una crescita applicata: il campo resta a 0 e il
          // report lo ignora quando il profilo è «FOTOGRAFIA».
          0,
          JSON.stringify(lettura.fotografia.anni),
          JSON.stringify(lettura.fotografia.avvertenze),
        ]
      );
      fotografiaId = Number(inserita.rows[0]?.id);
    }

    return {
      success: true,
      fotografia: lettura.fotografia,
      debito: lettura.debito,
      fotografiaId,
      nota: lettura.nota,
      asse: lettura.asse,
    };
  } catch (error: unknown) {
    console.error('[calcolaVerificaAziendaAction] Errore:', error);
    return { success: false, error: `Fotografia non riuscita: ${(error as Error).message}` };
  }
}

/** La fotografia salvata come base degli scenari di accordo transattivo. */
export async function ottieniSimulazioneBaseAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoSimulazioneBase> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) {
      return { success: false, base: null, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);
    const r = await pool.query(
      `SELECT id, profilo, annualita, created_at
         FROM "${nomeSchema}".verifica_azienda_simulazioni
        WHERE azienda_id = $1 AND base_per_proposta = TRUE
        ORDER BY created_at DESC
        LIMIT 1`,
      [aziendaId]
    );
    const riga = r.rows[0];
    return {
      success: true,
      base: riga
        ? {
            id: Number(riga.id),
            profilo: String(riga.profilo),
            annualita: Number(riga.annualita),
            createdAt: riga.created_at?.toString() ?? '',
          }
        : null,
    };
  } catch (error: unknown) {
    console.error('[ottieniSimulazioneBaseAction] Errore:', error);
    return {
      success: false,
      base: null,
      error: `Impossibile leggere la base: ${(error as Error).message}`,
    };
  }
}

/** Fissa una fotografia come base; le altre della stessa azienda tornano a non esserlo. */
export async function salvaSimulazioneBaseAction(
  nomeSchema: string,
  aziendaId: number,
  simulazioneId: number
): Promise<{ success: boolean; simulazioneId?: number; error?: string }> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (!Number.isInteger(simulazioneId) || simulazioneId <= 0) {
      return { success: false, error: 'Fotografia non riconosciuta.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);
    const esiste = await pool.query(
      `SELECT id FROM "${nomeSchema}".verifica_azienda_simulazioni
        WHERE id = $1 AND azienda_id = $2`,
      [simulazioneId, aziendaId]
    );
    if (esiste.rows.length === 0) {
      return { success: false, error: 'La fotografia non appartiene a questa azienda.' };
    }
    await pool.query(
      `UPDATE "${nomeSchema}".verifica_azienda_simulazioni
          SET base_per_proposta = FALSE
        WHERE azienda_id = $1`,
      [aziendaId]
    );
    await pool.query(
      `UPDATE "${nomeSchema}".verifica_azienda_simulazioni
          SET base_per_proposta = TRUE
        WHERE id = $1`,
      [simulazioneId]
    );
    return { success: true, simulazioneId };
  } catch (error: unknown) {
    console.error('[salvaSimulazioneBaseAction] Errore:', error);
    return { success: false, error: `Base non salvata: ${(error as Error).message}` };
  }
}
