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

import { pool } from '@/lib/db';
import { richiediAccessoAzienda } from '@/lib/autorizzazione';
import { apriVerifica, leggiAperturaVerifica } from '@/lib/verificheApertura';
import { componiProiezione } from '@/lib/contabile/proiezione';
import { assicuraTabelleScenariTriage, assicuraTabelleVerificaAzienda } from '@/db/provision';
import {
  componiFotografia,
  type FotografiaVerificaAzienda,
} from '@/lib/verificaAzienda/fotografia';
import { RANGHI, type ParametriScenari, type RangoCredito } from '@/lib/triage/scenari';
import { leggiDebitoEnteMemorizzato } from '@/lib/debitiEnte/memorizzaDebitoEnte';
import { selezionaNote, type SezioneNota } from '@/lib/xbrl/note';
import type { DatiFinanziariPeriodo, FactTestuale } from '@/lib/xbrl/types';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface DebitoVerificaAzienda {
  totale: number;
  memorizzatoIl: string | null;
  fonte: string;
}

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

export interface AsseContabileVerificaAzienda {
  annoBase: number | null;
  annoUltimoBilancio: number | null;
  annoVerifica: number;
  /** Gli anni costruiti dai differenziali sulla base: etichettati «calcolato». */
  annualitaCalcolate: number[];
}

export interface RiepilogoNota {
  anno: number | null;
  sezioni: string[];
  continuita: string | null;
  piani: string | null;
}

/** La nota integrativa dell'ultimo bilancio, ridotta a ciò che serve: sezioni e due testi. */
function riepilogaNota(fatti: unknown, anno: number | null): RiepilogoNota | null {
  if (!Array.isArray(fatti) || fatti.length === 0) return null;
  const note = selezionaNote(fatti as FactTestuale[]);
  const testo = (sezione: SezioneNota): string | null => {
    const trovato = note.fatti.find((f) => f.sezione === sezione);
    return trovato ? trovato.testo.slice(0, 600) : null;
  };
  return {
    anno,
    sezioni: note.sezioni.map((s) => s.sezione),
    continuita: testo('CONTINUITA'),
    piani: testo('PIANI'),
  };
}

/**
 * Il rango del credito scelto nel triage dell'azienda. Una tabella assente o un
 * rango non riconosciuto valgono «non scelto»: le percentuali per rango non si
 * applicano, e la fotografia lo dice.
 */
async function leggiRangoAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<RangoCredito | null> {
  try {
    await assicuraTabelleScenariTriage(nomeSchema);
    const r = await pool.query(
      `SELECT rango FROM "${nomeSchema}".triage_scenario WHERE azienda_id = $1`,
      [aziendaId]
    );
    const codice = r.rows[0]?.rango ? String(r.rows[0].rango) : null;
    return RANGHI.find((x) => x.codice === codice)?.codice ?? null;
  } catch {
    return null;
  }
}

/**
 * Le percentuali per rango fissate dall'ente. Nessun default: una riga
 * mancante resta null e lo scenario si dichiara non calcolabile.
 */
async function leggiParametriScenari(nomeSchema: string): Promise<ParametriScenari> {
  const vuoti: ParametriScenari = {
    costiProceduraPct: null,
    ranghi: RANGHI.map((r) => ({
      rango: r.codice,
      tassoLiquidazionePct: null,
      cramDownPct: null,
    })),
  };
  try {
    await assicuraTabelleScenariTriage(nomeSchema);
    const [config, righe] = await Promise.all([
      pool.query(`SELECT costi_procedura_pct FROM "${nomeSchema}".parametri_scenari WHERE id = 1`),
      pool.query(
        `SELECT rango, tasso_liquidazione_pct, cram_down_pct
           FROM "${nomeSchema}".parametri_scenari_rango`
      ),
    ]);
    const num = (v: unknown): number | null =>
      v === null || v === undefined || v === '' ? null : Number(v);
    const perRango = new Map(righe.rows.map((r) => [String(r.rango), r]));
    return {
      costiProceduraPct: num(config.rows[0]?.costi_procedura_pct),
      ranghi: RANGHI.map((r) => {
        const salvata = perRango.get(r.codice);
        return {
          rango: r.codice,
          tassoLiquidazionePct: num(salvata?.tasso_liquidazione_pct),
          cramDownPct: num(salvata?.cram_down_pct),
        };
      }),
    };
  } catch {
    return vuoti;
  }
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
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, error: 'Azienda non riconosciuta.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);

    // La verifica azienda ha la sua data d'apertura, come la contabile: la
    // prima lettura la fissa, le successive la leggono. Serve a sapere con
    // quali criteri è stata fatta la prima fotografia.
    await apriVerifica(nomeSchema, aziendaId, 'AZIENDALE').catch(() => undefined);

    const bilancioRis = await pool.query(
      `SELECT anno_bilancio, dati_finanziari FROM "${nomeSchema}".xbrl_storico_azienda
        WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL
        ORDER BY anno_bilancio ASC`,
      [aziendaId]
    );
    const bilanci = bilancioRis.rows
      .map((r) => ({
        anno: Number(r.anno_bilancio),
        dati: r.dati_finanziari as DatiFinanziariPeriodo,
      }))
      .filter((a) => Number.isInteger(a.anno) && a.dati);

    // L'asse temporale è quello della contabile: la serie si ferma all'anno in
    // cui la verifica contabile è stata aperta. La verifica azienda non
    // aggiunge annualità sue.
    const aperturaContabile = await leggiAperturaVerifica(nomeSchema, aziendaId, 'CONTABILE');
    const annoVerifica = aperturaContabile
      ? Number(aperturaContabile.slice(0, 4))
      : new Date().getFullYear();

    // Il credito vantato è il debito accertato nell'amministrativa. Si legge
    // prima dell'asse: la contabile chiude la voce dell'ente sullo stesso stock.
    const memorizzato = await leggiDebitoEnteMemorizzato(nomeSchema, aziendaId);
    const debito = memorizzato
      ? {
          totale: memorizzato.debito.totale,
          memorizzatoIl: memorizzato.memorizzatoIl,
          fonte: memorizzato.debito.fonte,
        }
      : null;

    const asseContabile = componiProiezione({
      bilanci,
      annoVerifica,
      debitoEnte: memorizzato
        ? {
            totale: memorizzato.debito.totale,
            fonte: memorizzato.debito.fonte,
            accertatoIl: memorizzato.memorizzatoIl,
          }
        : null,
    });

    const [rango, parametri] = await Promise.all([
      leggiRangoAzienda(nomeSchema, aziendaId),
      leggiParametriScenari(nomeSchema),
    ]);

    const fotografia = componiFotografia({
      proiezione: asseContabile,
      credito: debito?.totale ?? null,
      rango,
      parametri,
    });

    // La nota integrativa dell'ultimo bilancio: si mostra accanto alla
    // fotografia, non diventa un tasso. Se i bilanci non la portano, non è un
    // errore.
    let nota: RiepilogoNota | null = null;
    try {
      const notaRis = await pool.query(
        `SELECT anno_bilancio, note_fatti FROM "${nomeSchema}".xbrl_storico_azienda
          WHERE azienda_id = $1 AND note_fatti IS NOT NULL
          ORDER BY anno_bilancio DESC NULLS LAST
          LIMIT 1`,
        [aziendaId]
      );
      const riga = notaRis.rows[0];
      if (riga) {
        nota = riepilogaNota(
          riga.note_fatti,
          riga.anno_bilancio === null || riga.anno_bilancio === undefined
            ? null
            : Number(riga.anno_bilancio)
        );
      }
    } catch {
      nota = null;
    }

    let fotografiaId: number | undefined;
    if (fotografia.anni.length > 0) {
      const inserita = await pool.query(
        `INSERT INTO "${nomeSchema}".verifica_azienda_simulazioni
           (azienda_id, profilo, annualita, debito_ente, crescita_storica_pct,
            crescita_applicata_pct, colonne, avvertenze)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          aziendaId,
          'FOTOGRAFIA',
          fotografia.anni.length,
          fotografia.credito ?? 0,
          null,
          // La fotografia non ha una crescita applicata: il campo resta a 0 e il
          // report lo ignora quando il profilo è «FOTOGRAFIA».
          0,
          JSON.stringify(fotografia.anni),
          JSON.stringify(fotografia.avvertenze),
        ]
      );
      fotografiaId = Number(inserita.rows[0]?.id);
    }

    return {
      success: true,
      fotografia,
      debito,
      fotografiaId,
      nota,
      asse: {
        annoBase: asseContabile.annoBase,
        annoUltimoBilancio: asseContabile.annoUltimoBilancio,
        annoVerifica,
        annualitaCalcolate: asseContabile.annualitaCalcolate,
      },
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
