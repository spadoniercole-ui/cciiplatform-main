'use server';

// VERIFICA AZIENDA — la simulazione che unisce le due verifiche.
//
// Legge gli anni di bilancio depositati (contabile), il debito memorizzato a
// fine verifica amministrativa, applica il profilo scelto (standard,
// migliorativo, peggiorativo) e restituisce la mappa a colonne affiancate con
// gli indici. Il calcolo sta in src/lib/verificaAzienda/simulazione.ts, che è
// puro e ha i suoi test; qui si autorizza, si legge e si conserva.
//
// L'ORIZZONTE (0.205.0) ha due livelli: il predefinito dello spazio (una riga
// di configurazione, che vale per tutte) e, se serve, quello della singola
// azienda (`verifica_azienda_orizzonti`). Il secondo si usa quando la posizione
// ha una storia sua — un piano più corto, un triennio già deliberato — e non
// deve costringere tutto lo spazio a cambiare orizzonte: cambiare il valore di
// spazio, da solo, non deve riscrivere valutazioni già fatte.
//
// LA TRAIETTURA non è più a tasso costante: parte dalla crescita storica dei
// ricavi depositati e converge verso la crescita del settore (serie ISTAT già
// in cache), con la forma dichiarata in src/lib/verificaAzienda/simulazione.ts.
// La nota integrativa dell'ultimo bilancio viene letta e riassunta accanto alla
// simulazione: dice l'andamento dichiarato dagli amministratori e i piani, e
// non si trasforma in un tasso inventato.

import { pool } from '@/lib/db';
import { richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleVerificaAzienda } from '@/db/provision';
import {
  ANNUALITA_MASSIME,
  ANNUALITA_MINIME,
  ANNUALITA_PREDEFINITE,
  PROFILI,
  colonneSimulazione,
  type AnnoStorico,
  type EsitoSimulazione,
  type ProfiloSimulazione,
} from '@/lib/verificaAzienda/simulazione';
import { leggiDebitoEnteMemorizzato } from '@/lib/debitiEnte/memorizzaDebitoEnte';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { crescitaDaSerie } from '@/lib/piano/automatico';
import { selezionaNote, type SezioneNota } from '@/lib/xbrl/note';
import type { DatiFinanziariPeriodo, FactTestuale } from '@/lib/xbrl/types';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface RisultatoConfigVerificaAzienda {
  success: boolean;
  annualita: number;
  /** Il flag che abilita il lancio della simulazione nello spazio (0.195.0). */
  simulazioneAttiva: boolean;
  error?: string;
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

export interface DebitoVerificaAzienda {
  totale: number;
  memorizzatoIl: string | null;
  fonte: string;
}

export interface RisultatoVerificaAzienda {
  success: boolean;
  esito?: EsitoSimulazione;
  debito?: DebitoVerificaAzienda | null;
  simulazioneId?: number;
  /** Orizzonte usato dal calcolo: il suo, quello dell'azienda o il predefinito. */
  orizzonte?: { annualita: number; personalizzato: boolean; spazio: number };
  /** Nota integrativa dell'ultimo bilancio, riassunta: contesto, non un tasso. */
  nota?: RiepilogoNota | null;
  error?: string;
}

export interface RiepilogoNota {
  anno: number | null;
  sezioni: string[];
  continuita: string | null;
  piani: string | null;
}

export interface RisultatoOrizzonteAzienda {
  success: boolean;
  annualita: number;
  personalizzato: boolean;
  spazio: number;
  error?: string;
}

/** Orizzonte proprio dell'azienda, se ne ha uno; null = vale il predefinito. */
async function leggiOrizzonteAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<number | null> {
  await assicuraTabelleVerificaAzienda(nomeSchema);
  const r = await pool.query(
    `SELECT annualita FROM "${nomeSchema}".verifica_azienda_orizzonti WHERE azienda_id = $1`,
    [aziendaId]
  );
  const n = Number(r.rows[0]?.annualita);
  if (!Number.isFinite(n)) return null;
  return Math.min(ANNUALITA_MASSIME, Math.max(ANNUALITA_MINIME, n));
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

export async function ottieniConfigVerificaAziendaAction(
  nomeSchema: string
): Promise<RisultatoConfigVerificaAzienda> {
  try {
    await richiediAccessoSchema(nomeSchema);
    if (!schemaOk(nomeSchema)) {
      return {
        success: false,
        annualita: ANNUALITA_PREDEFINITE,
        simulazioneAttiva: false,
        error: 'Nome schema non valido.',
      };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);
    const r = await pool.query(
      `SELECT annualita_proiezione, simulazione_attiva
         FROM "${nomeSchema}".verifica_azienda_config WHERE id = 1`
    );
    const n = Number(r.rows[0]?.annualita_proiezione);
    return {
      success: true,
      annualita: Number.isFinite(n)
        ? Math.min(ANNUALITA_MASSIME, Math.max(ANNUALITA_MINIME, n))
        : ANNUALITA_PREDEFINITE,
      simulazioneAttiva: Boolean(r.rows[0]?.simulazione_attiva),
    };
  } catch (error: unknown) {
    console.error('[ottieniConfigVerificaAziendaAction] Errore:', error);
    return {
      success: false,
      annualita: ANNUALITA_PREDEFINITE,
      simulazioneAttiva: false,
      error: `Impossibile leggere la configurazione: ${(error as Error).message}`,
    };
  }
}

export async function impostaConfigVerificaAziendaAction(
  nomeSchema: string,
  annualita: number
): Promise<RisultatoConfigVerificaAzienda> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) {
      return {
        success: false,
        annualita: ANNUALITA_PREDEFINITE,
        simulazioneAttiva: false,
        error: 'Nome schema non valido.',
      };
    }
    if (
      !Number.isInteger(annualita) ||
      annualita < ANNUALITA_MINIME ||
      annualita > ANNUALITA_MASSIME
    ) {
      return {
        success: false,
        annualita: ANNUALITA_PREDEFINITE,
        simulazioneAttiva: false,
        error: `Le annualità di proiezione stanno fra ${ANNUALITA_MINIME} e ${ANNUALITA_MASSIME}.`,
      };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".verifica_azienda_config (id, annualita_proiezione, updated_at)
       VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET annualita_proiezione = EXCLUDED.annualita_proiezione, updated_at = now()`,
      [annualita]
    );
    const flag = await pool.query(
      `SELECT simulazione_attiva FROM "${nomeSchema}".verifica_azienda_config WHERE id = 1`
    );
    return {
      success: true,
      annualita,
      simulazioneAttiva: Boolean(flag.rows[0]?.simulazione_attiva),
    };
  } catch (error: unknown) {
    console.error('[impostaConfigVerificaAziendaAction] Errore:', error);
    return {
      success: false,
      annualita: ANNUALITA_PREDEFINITE,
      simulazioneAttiva: false,
      error: `Impossibile salvare la configurazione: ${(error as Error).message}`,
    };
  }
}

/** Accende o spegne il lancio della simulazione nello spazio (0.195.0). */
export async function impostaSimulazioneAttivaAction(
  nomeSchema: string,
  attiva: boolean
): Promise<{ success: boolean; attiva: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) {
      return { success: false, attiva: false, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".verifica_azienda_config
         (id, annualita_proiezione, simulazione_attiva, updated_at)
       VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE
         SET simulazione_attiva = EXCLUDED.simulazione_attiva, updated_at = now()`,
      [ANNUALITA_PREDEFINITE, attiva]
    );
    return { success: true, attiva };
  } catch (error: unknown) {
    console.error('[impostaSimulazioneAttivaAction] Errore:', error);
    return {
      success: false,
      attiva: false,
      error: `Impossibile salvare il flag: ${(error as Error).message}`,
    };
  }
}

/** L'orizzonte di questa azienda: il suo, o il predefinito dello spazio. */
export async function ottieniOrizzonteAziendaAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoOrizzonteAzienda> {
  const predefinito = {
    annualita: ANNUALITA_PREDEFINITE,
    personalizzato: false,
    spazio: ANNUALITA_PREDEFINITE,
  };
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) {
      return { success: false, ...predefinito, error: 'Nome schema non valido.' };
    }
    const config = await ottieniConfigVerificaAziendaAction(nomeSchema);
    const proprio = await leggiOrizzonteAzienda(nomeSchema, aziendaId);
    return {
      success: true,
      annualita: proprio ?? config.annualita,
      personalizzato: proprio !== null,
      spazio: config.annualita,
    };
  } catch (error: unknown) {
    console.error('[ottieniOrizzonteAziendaAction] Errore:', error);
    return {
      success: false,
      ...predefinito,
      error: `Impossibile leggere l'orizzonte: ${(error as Error).message}`,
    };
  }
}

/**
 * Fissa l'orizzonte di questa azienda. `null` toglie l'override e torna al
 * predefinito dello spazio. Le simulazioni già salvate non si toccano: portano
 * con sé l'orizzonte con cui sono state calcolate.
 */
export async function impostaOrizzonteAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  annualita: number | null
): Promise<RisultatoOrizzonteAzienda> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) {
      return {
        success: false,
        annualita: ANNUALITA_PREDEFINITE,
        personalizzato: false,
        spazio: ANNUALITA_PREDEFINITE,
        error: 'Nome schema non valido.',
      };
    }
    if (
      annualita !== null &&
      (!Number.isInteger(annualita) ||
        annualita < ANNUALITA_MINIME ||
        annualita > ANNUALITA_MASSIME)
    ) {
      return {
        success: false,
        annualita: ANNUALITA_PREDEFINITE,
        personalizzato: false,
        spazio: ANNUALITA_PREDEFINITE,
        error: `Le annualità di proiezione stanno fra ${ANNUALITA_MINIME} e ${ANNUALITA_MASSIME}.`,
      };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);
    if (annualita === null) {
      await pool.query(
        `DELETE FROM "${nomeSchema}".verifica_azienda_orizzonti WHERE azienda_id = $1`,
        [aziendaId]
      );
    } else {
      await pool.query(
        `INSERT INTO "${nomeSchema}".verifica_azienda_orizzonti (azienda_id, annualita, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (azienda_id) DO UPDATE
           SET annualita = EXCLUDED.annualita, updated_at = now()`,
        [aziendaId, annualita]
      );
    }
    return ottieniOrizzonteAziendaAction(nomeSchema, aziendaId);
  } catch (error: unknown) {
    console.error('[impostaOrizzonteAziendaAction] Errore:', error);
    return {
      success: false,
      annualita: ANNUALITA_PREDEFINITE,
      personalizzato: false,
      spazio: ANNUALITA_PREDEFINITE,
      error: `Impossibile salvare l'orizzonte: ${(error as Error).message}`,
    };
  }
}

/** La simulazione salvata come base degli scenari di accordo transattivo. */
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

/** Fissa una simulazione come base; le altre della stessa azienda tornano a non esserlo. */
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
      return { success: false, error: 'Simulazione non riconosciuta.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);
    const esiste = await pool.query(
      `SELECT id FROM "${nomeSchema}".verifica_azienda_simulazioni
        WHERE id = $1 AND azienda_id = $2`,
      [simulazioneId, aziendaId]
    );
    if (esiste.rows.length === 0) {
      return { success: false, error: 'La simulazione non appartiene a questa azienda.' };
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

/**
 * Calcola la mappa e la conserva. Il profilo è una scelta dell'operatore, non
 * un valore dedotto: tre profili, tre simulazioni distinte, tutte leggibili
 * nello storico.
 */
export async function calcolaVerificaAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  profilo: ProfiloSimulazione,
  annualita?: number
): Promise<RisultatoVerificaAzienda> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!PROFILI.some((p) => p.codice === profilo)) {
      return { success: false, error: 'Profilo di simulazione non riconosciuto.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);

    const config = await ottieniConfigVerificaAziendaAction(nomeSchema);
    const propria = await leggiOrizzonteAzienda(nomeSchema, aziendaId);
    const annualitaScelta = annualita ?? propria ?? config.annualita;

    const bilancioRis = await pool.query(
      `SELECT anno_bilancio, dati_finanziari FROM "${nomeSchema}".xbrl_storico_azienda
        WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL
        ORDER BY anno_bilancio ASC`,
      [aziendaId]
    );
    const anni: AnnoStorico[] = bilancioRis.rows
      .map((r) => ({
        anno: Number(r.anno_bilancio),
        dati: r.dati_finanziari as DatiFinanziariPeriodo,
      }))
      .filter(
        (a) => Number.isInteger(a.anno) && a.dati && typeof a.dati.ricaviVendite === 'number'
      );

    const memorizzato = await leggiDebitoEnteMemorizzato(nomeSchema, aziendaId);
    const debito = memorizzato
      ? {
          totale: memorizzato.debito.totale,
          memorizzatoIl: memorizzato.memorizzatoIl,
          fonte: memorizzato.debito.fonte,
        }
      : null;

    // La crescita di settore viene dalla serie ISTAT già in archivio: la
    // funzione la legge dalla cache e non interroga ISTAT. Se manca, la
    // traiettoria converge verso ricavi invariati e lo dichiara.
    let crescitaSettorePct: number | null = null;
    try {
      const settoreRis = await ottieniDatiSettore(nomeSchema, aziendaId);
      if (settoreRis.success && settoreRis.punti.length > 0) {
        crescitaSettorePct = crescitaDaSerie(settoreRis.punti)?.tasso ?? null;
      }
    } catch {
      crescitaSettorePct = null;
    }

    // La nota integrativa dell'ultimo bilancio: si mostra accanto alla
    // simulazione, non diventa un tasso. Se la tabella non c'è (azienda senza
    // bilanci) la simulazione non deve fallire per questo.
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

    const esito = colonneSimulazione({
      anni,
      profilo,
      annualita: annualitaScelta,
      debitoEnte: debito?.totale ?? 0,
      crescitaSettorePct,
    });

    let simulazioneId: number | undefined;
    if (esito.colonne.length > 0) {
      const inserita = await pool.query(
        `INSERT INTO "${nomeSchema}".verifica_azienda_simulazioni
           (azienda_id, profilo, annualita, debito_ente, crescita_storica_pct,
            crescita_applicata_pct, colonne, avvertenze)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          aziendaId,
          esito.profilo,
          esito.annualita,
          esito.debitoEnte,
          esito.crescitaStoricaPct,
          esito.crescitaApplicataPct,
          JSON.stringify(esito.colonne),
          JSON.stringify(esito.avvertenze),
        ]
      );
      simulazioneId = Number(inserita.rows[0]?.id);
    }

    return {
      success: true,
      esito,
      debito,
      simulazioneId,
      orizzonte: {
        annualita: esito.annualita,
        personalizzato: propria !== null,
        spazio: config.annualita,
      },
      nota,
    };
  } catch (error: unknown) {
    console.error('[calcolaVerificaAziendaAction] Errore:', error);
    return { success: false, error: `Simulazione non riuscita: ${(error as Error).message}` };
  }
}
