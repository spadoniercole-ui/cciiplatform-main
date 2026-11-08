'use server';

// Piano-ponte — server action dell'unico percorso azienda → conti attuali.
//
// La guardia è sempre la prima istruzione: il Ponte è solo per spazi ENTE e
// per un'azienda assegnata. Le azioni non si fidano né del nome schema né
// dell'id passati dal browser; il contesto viene dalla sessione.

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/lib/db';
import { richiediAccessoAzienda } from '@/lib/autorizzazione';
import {
  assicuraTabellaPonteTemporale,
  assicuraTabellaXbrlAzienda,
  assicuraTabellaDatiSettore,
  assicuraTabelleScreeningAzienda,
  assicuraTabelleVera,
} from '@/db/provision';
import { estraiJson, normalizzaFattiVisura } from '@/lib/visura/fatti';
import { consumaQuotaAi } from '@/lib/limiteAi';
import { erroreServizioEsterno, messaggioChiaveAiMancante } from '@/lib/serviziEsterni';
import { RANGHI, type ParametriScenari, type RangoCredito } from '@/lib/triage/scenari';
import { PROMPT_VERSIONE, promptAssunzioniPonte, validaPropostaAi } from '@/lib/ponte/assunzioniAi';
import { analizzaCodiceAteco } from '@/lib/settore/atecoMapping';
import { crescitaDaSerie, crescitaAzienda } from '@/lib/piano/automatico';
import { type StatoDuplicatoVera } from '@/lib/debitiEnte/duplicatiVera';
import { type RigaVera, type TrattamentoVera } from '@/lib/debitiEnte/veraImport';
import { snapshotDebitoEnte } from '@/lib/ponte/debitoEnte';
import type { DatiFinanziariPeriodo, FactTestuale } from '@/lib/xbrl/types';
import { calcolaPonte, costruisciAssunzioni, ErrorePonte } from '@/lib/ponte/motore';
import { calcolaHashInput, calcolaHashOutput } from '@/lib/ponte/hash';
import type {
  AssunzionePonte,
  AvvisoPonte,
  DatiPonte,
  DebitoEntePonte,
  EsercizioPonte,
  InputPonte,
  PonteSalvato,
  PonteSintesi,
  SettorePonte,
  StatoPonte,
} from '@/lib/ponte/types';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 120 * 1000, maxRetries: 1 }) : null;
const MODELLO_PONTE = 'claude-sonnet-5';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

function verificaEnte(contesto: { tipoSpazio: 'ENTE' | 'NON_ENTE' }): void {
  if (contesto.tipoSpazio !== 'ENTE') {
    throw new Error('Il Piano-ponte è disponibile solo per gli spazi ENTE.');
  }
}

function numero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Un parametro assente resta assente: non diventa zero. */
function numeroOpzionale(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dataIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function mappaPonte(r: Record<string, any>): PonteSalvato {
  return {
    id: Number(r.id),
    aziendaId: Number(r.azienda_id),
    dataRiferimento: dataIso(r.data_riferimento) ?? '',
    versione: Number(r.versione),
    stato: String(r.stato) as StatoPonte,
    hashInput: String(r.hash_input),
    hashOutput: r.hash_output ? String(r.hash_output) : null,
    output: r.output ?? null,
    assunzioni: Array.isArray(r.assunzioni) ? (r.assunzioni as AssunzionePonte[]) : [],
    copertura: r.copertura ?? null,
    avvisi: Array.isArray(r.avvisi) ? (r.avvisi as AvvisoPonte[]) : [],
    limiti: Array.isArray(r.limiti) ? (r.limiti as string[]) : [],
    motoreVersione: String(r.motore_versione),
    noteCopertura: r.note_copertura === null ? null : Number(r.note_copertura),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
    confermatoIl: r.confermato_il ? new Date(r.confermato_il).toISOString() : null,
  };
}

function mappaEsercizio(r: Record<string, any>): EsercizioPonte {
  return {
    anno: Number(r.anno_bilancio),
    dati: (r.dati_finanziari ?? {}) as DatiFinanziariPeriodo,
    noteImpronta: r.note_impronta ?? null,
  };
}

/**
 * Carica tutto ciò che serve al Ponte, senza chiedere di nuovo l'autorizzazione:
 * il chiamante l'ha già verificata. La funzione non è esportata, quindi non è
 * un endpoint.
 */
async function caricaDati(nomeSchema: string, aziendaId: number): Promise<DatiPonte> {
  await assicuraTabellaPonteTemporale(nomeSchema);
  await assicuraTabellaXbrlAzienda(nomeSchema);
  await assicuraTabelleScreeningAzienda(nomeSchema);
  await assicuraTabelleVera(nomeSchema);

  const aziendaRis = await pool.query(
    `SELECT id, ragione_sociale, codice_ateco, verifica_esito,
            to_char(verifica_riferita_al, 'YYYY-MM-DD') AS data_verifica,
            visura_triage_url, visura_triage_nome,
            to_char(visura_triage_il, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS visura_triage_il
       FROM "${nomeSchema}".aziende WHERE id = $1`,
    [aziendaId]
  );
  const azienda = aziendaRis.rows[0];
  if (!azienda) throw new Error('Azienda non trovata.');

  const xbrlRis = await pool.query(
    `SELECT id, anno_bilancio, dati_finanziari, note_fatti, note_impronta
       FROM "${nomeSchema}".xbrl_storico_azienda
      WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL
      ORDER BY anno_bilancio ASC`,
    [aziendaId]
  );
  const esercizi = xbrlRis.rows.map(mappaEsercizio).filter((e) => Number.isInteger(e.anno));
  const conNote = [...xbrlRis.rows]
    .reverse()
    .find((r) => Array.isArray(r.note_fatti) && r.note_fatti.length > 0);
  const note: FactTestuale[] = Array.isArray(conNote?.note_fatti) ? conNote.note_fatti : [];

  let visura = null;
  let visuraImpronta: string | null = null;
  try {
    const visuraRis = await pool.query(
      `SELECT visura_fatti, visura_impronta FROM "${nomeSchema}".azienda_screening
        WHERE azienda_id = $1 LIMIT 1`,
      [aziendaId]
    );
    if (visuraRis.rows[0]?.visura_fatti) {
      visura = normalizzaFattiVisura(visuraRis.rows[0].visura_fatti);
      visuraImpronta = visuraRis.rows[0].visura_impronta ?? null;
    }
  } catch {
    // La tabella può non esistere su uno spazio nuovo: la visura è un input
    // facoltativo, non un motivo per far fallire il Ponte.
  }

  let debitoEnte: DebitoEntePonte | null = null;
  try {
    const debitiRis = await pool.query(
      `SELECT id, sezione, ambito, voce, importo, contributi, sanzioni, categoria, stato,
              trattamento, periodo, duplicato_stato
         FROM "${nomeSchema}".debiti_vera
        WHERE azienda_id = $1 ORDER BY id ASC`,
      [aziendaId]
    );
    const righe: RigaVera[] = debitiRis.rows.map((r) => ({
      id: Number(r.id),
      sezione: String(r.sezione ?? ''),
      ambito: (r.ambito ?? 'INPS') as RigaVera['ambito'],
      voce: String(r.voce ?? ''),
      importo: numero(r.importo),
      categoria: String(r.categoria ?? ''),
      stato: String(r.stato ?? ''),
      periodo: r.periodo ? String(r.periodo) : undefined,
      trattamento: String(r.trattamento ?? 'potenziale') as TrattamentoVera,
      contributi: r.contributi === null || r.contributi === undefined ? null : numero(r.contributi),
      sanzioni: r.sanzioni === null || r.sanzioni === undefined ? null : numero(r.sanzioni),
      duplicatoStato: (r.duplicato_stato ?? '') as StatoDuplicatoVera | '',
    }));
    if (righe.length > 0) {
      // Tre stati, tre cifre: il totale del Ponte è solo contabilizzato + da
      // contabilizzare; le posizioni segnalate si dichiarano a parte.
      debitoEnte = snapshotDebitoEnte(righe);
    }
  } catch {
    // Stessa regola della visura: senza certificazione il Ponte può partire,
    // ma il debito non viene inventato.
  }

  let puntiSettore: { periodo: string; valore: number }[] = [];
  let descrizioneSettore = 'Nessun codice ATECO o nessuna serie ISTAT in cache.';
  const info = azienda.codice_ateco ? analizzaCodiceAteco(String(azienda.codice_ateco)) : null;
  if (info?.dataflow) {
    try {
      await assicuraTabellaDatiSettore();
      const cache = await pool.query(
        `SELECT dati FROM public.dati_settore_cache WHERE gruppo_ateco = $1 AND dataflow = $2`,
        [info.gruppo, info.dataflow]
      );
      const salvato = cache.rows[0]?.dati;
      puntiSettore = Array.isArray(salvato)
        ? salvato
        : Array.isArray(salvato?.punti)
          ? salvato.punti
          : [];
      descrizioneSettore = `Serie ISTAT del gruppo ATECO ${info.gruppo}, livello ${info.dataflow.toLowerCase()}.`;
    } catch {
      // Cache globale non raggiungibile: si passa al CAGR aziendale.
    }
  }
  let settore: SettorePonte = { tasso: 0, fonte: 'nessuna', descrizione: descrizioneSettore };
  const serie = puntiSettore.length ? crescitaDaSerie(puntiSettore) : null;
  if (serie) {
    settore = {
      tasso: Math.max(-20, Math.min(20, Math.round(serie.tasso * 100) / 100)),
      fonte: 'settore',
      descrizione: `${descrizioneSettore} Crescita annua composta ${serie.dal}–${serie.al}: ${Math.round(serie.tasso * 100) / 100}%.`,
    };
  } else {
    const aziendale = crescitaAzienda(
      esercizi.map((e) => ({ anno: e.anno, ricaviVendite: e.dati.ricaviVendite }))
    );
    if (aziendale) {
      settore = {
        tasso: Math.max(-20, Math.min(20, Math.round(aziendale.tasso * 100) / 100)),
        fonte: 'azienda',
        descrizione: `Dati di settore non disponibili: crescita annua composta dei ricavi dell’azienda ${aziendale.dal}–${aziendale.al}, ${Math.round(aziendale.tasso * 100) / 100}%.`,
      };
    }
  }

  // Parametri e rango dell'ente: sono i soli dati con cui la Sintesi integrata
  // può parlare di recupero. Se le tabelle non ci sono (spazio che non ha mai
  // aperto gli scenari del triage) la lettura non deve far fallire il Ponte.
  let parametriScenari: ParametriScenari | null = null;
  let rangoCredito: RangoCredito | null = null;
  try {
    const [config, righe, rango] = await Promise.all([
      pool.query(`SELECT costi_procedura_pct FROM "${nomeSchema}".parametri_scenari WHERE id = 1`),
      pool.query(
        `SELECT rango, tasso_liquidazione_pct, cram_down_pct
           FROM "${nomeSchema}".parametri_scenari_rango`
      ),
      pool.query(`SELECT rango FROM "${nomeSchema}".triage_scenario WHERE azienda_id = $1`, [
        aziendaId,
      ]),
    ]);
    const perRango = new Map(righe.rows.map((r) => [String(r.rango), r]));
    parametriScenari = {
      costiProceduraPct: numeroOpzionale(config.rows[0]?.costi_procedura_pct),
      ranghi: RANGHI.map((r) => {
        const salvata = perRango.get(r.codice);
        return {
          rango: r.codice,
          tassoLiquidazionePct: numeroOpzionale(salvata?.tasso_liquidazione_pct),
          cramDownPct: numeroOpzionale(salvata?.cram_down_pct),
        };
      }),
    };
    const scelto = rango.rows[0]?.rango ? String(rango.rows[0].rango) : null;
    rangoCredito = RANGHI.some((r) => r.codice === scelto) ? (scelto as RangoCredito) : null;
  } catch {
    // Parametri facoltativi: la Sintesi dichiarerà il recupero non calcolabile.
  }

  const ponteRis = await pool.query(
    `SELECT id, azienda_id, data_riferimento, stato, versione, hash_input, hash_output,
            output, assunzioni, copertura, avvisi, limiti, motore_versione,
            note_copertura, created_at, confermato_il
       FROM "${nomeSchema}".ponte_temporale
      WHERE azienda_id = $1
      ORDER BY versione DESC, created_at DESC LIMIT 1`,
    [aziendaId]
  );
  const storicoRis = await pool.query(
    `SELECT id, versione, stato, to_char(data_riferimento, 'YYYY-MM-DD') AS data_riferimento,
            created_at, confermato_il
       FROM "${nomeSchema}".ponte_temporale
      WHERE azienda_id = $1 ORDER BY versione DESC`,
    [aziendaId]
  );
  const storico: PonteSintesi[] = storicoRis.rows.map((r) => ({
    id: Number(r.id),
    versione: Number(r.versione),
    stato: String(r.stato) as StatoPonte,
    dataRiferimento: dataIso(r.data_riferimento) ?? '',
    createdAt: new Date(r.created_at).toISOString(),
    confermatoIl: r.confermato_il ? new Date(r.confermato_il).toISOString() : null,
  }));

  const dataVerifica = azienda.data_verifica ? String(azienda.data_verifica) : null;
  const blocchi: AvvisoPonte[] = [];
  if (!dataVerifica) {
    blocchi.push({
      codice: 'DATA_VERIFICA_ASSENTE',
      testo:
        'Manca la Data verifica. Completala nella Verifica amministrativa: il Ponte non usa la data di oggi come se fosse quella dei conti.',
    });
  }
  if (esercizi.length === 0) {
    blocchi.push({
      codice: 'XBRL_ASSENTE',
      testo:
        'Nessun bilancio XBRL con anno e dati finanziari: carica almeno un bilancio prima del Ponte.',
    });
  }
  if (dataVerifica && esercizi.length > 0) {
    const ultimo = esercizi[esercizi.length - 1];
    const data = new Date(`${dataVerifica}T00:00:00Z`);
    if (data.getTime() <= Date.UTC(ultimo.anno, 11, 31)) {
      blocchi.push({
        codice: 'PONTE_NON_NECESSARIO',
        testo: `L’ultimo bilancio (${ultimo.anno}) arriva già alla Data verifica: non serve un Ponte.`,
      });
    } else {
      const mesi = (data.getUTCFullYear() - ultimo.anno - 1) * 12 + data.getUTCMonth() + 1;
      if (mesi > 60) {
        blocchi.push({
          codice: 'GAP_TROPPO_LUNGO',
          testo: `Il Ponte coprirebbe ${mesi} mesi, oltre il limite di 60: carica un bilancio più recente o conferma un orizzonte eccezionale.`,
        });
      }
    }
  }

  return {
    azienda: {
      id: Number(azienda.id),
      ragioneSociale: String(azienda.ragione_sociale),
      codiceAteco: azienda.codice_ateco ? String(azienda.codice_ateco) : null,
      dataVerifica,
      verificaEsito: azienda.verifica_esito ? String(azienda.verifica_esito) : null,
    },
    esercizi,
    note,
    visura,
    visuraImpronta,
    visuraTrattenuta: azienda.visura_triage_url
      ? {
          nome: String(azienda.visura_triage_nome ?? 'visura.pdf'),
          caricataIl: azienda.visura_triage_il ? String(azienda.visura_triage_il) : null,
        }
      : null,
    settore,
    parametriScenari,
    rangoCredito,
    debitoEnte,
    ponte: ponteRis.rows[0] ? mappaPonte(ponteRis.rows[0]) : null,
    storico,
    blocchi,
  };
}

/**
 * L'input del motore, costruito in un punto solo: generazione, salvataggio e
 * proposta AI devono partire dagli stessi dati, altrimenti due percorsi
 * calcolano due Ponte diversi sugli stessi numeri.
 */
function costruisciInput(
  aziendaId: number,
  dati: DatiPonte,
  debitoEnteDichiaratoZero: boolean,
  assunzioni?: AssunzionePonte[]
): InputPonte {
  return {
    aziendaId,
    dataRiferimento: dati.azienda.dataVerifica as string,
    esercizi: dati.esercizi,
    debitoEnte: dati.debitoEnte,
    debitoEnteDichiaratoZero,
    note: dati.note,
    visura: dati.visura,
    visuraImpronta: dati.visuraImpronta,
    settore: dati.settore,
    parametriScenari: dati.parametriScenari,
    rangoCredito: dati.rangoCredito,
    assunzioni,
  };
}

export async function ottieniPonteAction(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; dati?: DatiPonte; error?: string }> {
  try {
    const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId, {
      modulo: ['xbrl'],
      livello: 'LETTURA',
    });
    verificaEnte(contesto);
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    return { success: true, dati: await caricaDati(nomeSchema, aziendaId) };
  } catch (error: any) {
    console.error('[ottieniPonteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile caricare il Piano-ponte: ${error.message || error}`,
    };
  }
}

export async function generaPonteAction(
  nomeSchema: string,
  aziendaId: number,
  debitoEnteDichiaratoZero = false,
  assunzioni?: AssunzionePonte[]
): Promise<{ success: boolean; ponteId?: number; error?: string }> {
  try {
    const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId, {
      modulo: ['xbrl'],
      livello: 'SCRITTURA',
    });
    verificaEnte(contesto);
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const dati = await caricaDati(nomeSchema, aziendaId);
    const blocco = dati.blocchi.find((b) => b.codice !== 'DEBITO_ENTE_ASSENTE');
    if (blocco) return { success: false, error: blocco.testo };
    if (!dati.debitoEnte && !debitoEnteDichiaratoZero) {
      return {
        success: false,
        error:
          'Il debito ente non è disponibile. Carica la certificazione oppure dichiara espressamente che è zero: un file assente non vale zero.',
      };
    }

    const input = costruisciInput(aziendaId, dati, debitoEnteDichiaratoZero, assunzioni);
    const output = calcolaPonte(input);
    const versioneRis = await pool.query(
      `SELECT COALESCE(MAX(versione), 0) + 1 AS versione FROM "${nomeSchema}".ponte_temporale
        WHERE azienda_id = $1`,
      [aziendaId]
    );
    const inserimento = await pool.query(
      `INSERT INTO "${nomeSchema}".ponte_temporale
        (azienda_id, data_riferimento, stato, versione, hash_input, hash_output, input, output,
         assunzioni, copertura, avvisi, limiti, motore_versione, note_copertura, generato_da)
       VALUES ($1, $2, 'CALCOLATO', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        aziendaId,
        input.dataRiferimento,
        Number(versioneRis.rows[0].versione),
        calcolaHashInput(input),
        calcolaHashOutput(output),
        JSON.stringify(input),
        JSON.stringify(output),
        JSON.stringify(output.assunzioni),
        JSON.stringify(output.copertura),
        JSON.stringify(output.avvisi),
        JSON.stringify(output.limiti),
        output.versioneMotore,
        output.copertura.componenti.find((c) => c.codice === 'NOTE')?.determinato ? 1 : 0,
        contesto.email ?? null,
      ]
    );
    const ponteId = Number(inserimento.rows[0].id);
    await pool.query(
      `INSERT INTO "${nomeSchema}".ponte_temporale_eventi (ponte_id, tipo, dettaglio, utente)
       VALUES ($1, 'CALCOLATO', $2, $3)`,
      [
        ponteId,
        JSON.stringify({ versione: Number(versioneRis.rows[0].versione) }),
        contesto.email ?? null,
      ]
    );
    return { success: true, ponteId };
  } catch (error: any) {
    console.error('[generaPonteAction] Errore:', error);
    if (error instanceof ErrorePonte) return { success: false, error: error.message };
    return {
      success: false,
      error: `Impossibile calcolare il Piano-ponte: ${error.message || error}`,
    };
  }
}

/**
 * La proposta di assunzioni dell'AI. Non calcola il Ponte e non salva nulla:
 * restituisce valori candidati con la motivazione, che il motore rivaliderà
 * comunque. Se il modello non risponde, il Ponte resta dov'era e l'operatore
 * inserisce le assunzioni a mano.
 */
export interface PropostaAiPonte {
  assunzioni: AssunzionePonte[];
  sintesi: string;
  datiMancanti: string[];
  avvisi: string[];
  scartate: string[];
  modello: string;
  promptVersione: string;
}

export async function proponiAssunzioniPonteAction(
  nomeSchema: string,
  aziendaId: number,
  debitoEnteDichiaratoZero = false
): Promise<{ success: boolean; proposta?: PropostaAiPonte; error?: string }> {
  try {
    const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId, {
      modulo: ['xbrl'],
      livello: 'SCRITTURA',
    });
    verificaEnte(contesto);
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!anthropic) return { success: false, error: messaggioChiaveAiMancante() };

    const dati = await caricaDati(nomeSchema, aziendaId);
    const blocco = dati.blocchi.find((b) => b.codice !== 'DEBITO_ENTE_ASSENTE');
    if (blocco) return { success: false, error: blocco.testo };
    if (!dati.debitoEnte && !debitoEnteDichiaratoZero) {
      return {
        success: false,
        error:
          'Il debito ente non è disponibile. Carica la certificazione oppure dichiara espressamente che è zero: un file assente non vale zero.',
      };
    }

    // Solo input validi consumano quota: i controlli vengono prima.
    const quota = await consumaQuotaAi(pool, 'PONTE', {
      utente: contesto.email || `spazio:${contesto.spazioId}`,
      spazioId: contesto.spazioId,
    });
    if (!quota.consentito) {
      return { success: false, error: quota.error || 'Limite di proposte raggiunto.' };
    }

    const input = costruisciInput(aziendaId, dati, debitoEnteDichiaratoZero);
    const base = costruisciAssunzioni(input);
    const prompt = promptAssunzioniPonte(input, base);

    let risposta: Anthropic.Messages.Message;
    try {
      risposta = await anthropic.messages.create({
        model: MODELLO_PONTE,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (errore) {
      console.error('[proponiAssunzioniPonteAction] Anthropic:', errore);
      return {
        success: false,
        error:
          erroreServizioEsterno(errore, 'AI') ||
          'La proposta di assunzioni non è arrivata: puoi inserirle a mano.',
      };
    }

    const testo = risposta.content
      .map((blocco) => (blocco.type === 'text' ? blocco.text : ''))
      .join('\n')
      .trim();
    const proposta = validaPropostaAi(estraiJson(testo), base);
    return {
      success: true,
      proposta: { ...proposta, modello: MODELLO_PONTE, promptVersione: PROMPT_VERSIONE },
    };
  } catch (error: any) {
    console.error('[proponiAssunzioniPonteAction] Errore:', error);
    return { success: false, error: `Proposta non riuscita: ${error.message || error}` };
  }
}

export async function salvaAssunzioniPonteAction(
  nomeSchema: string,
  aziendaId: number,
  ponteId: number,
  assunzioni: AssunzionePonte[]
): Promise<{ success: boolean; error?: string }> {
  const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId, {
    modulo: ['xbrl'],
    livello: 'SCRITTURA',
  });
  verificaEnte(contesto);
  const client = await pool.connect();
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT input, stato FROM "${nomeSchema}".ponte_temporale
        WHERE id = $1 AND azienda_id = $2 FOR UPDATE`,
      [ponteId, aziendaId]
    );
    if (!r.rows[0]) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Piano-ponte non trovato.' };
    }
    if (r.rows[0].stato === 'CONFERMATO' || r.rows[0].stato === 'ARCHIVIATO') {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'Il Piano-ponte confermato o archiviato non si modifica: creane una nuova versione.',
      };
    }
    const input = { ...(r.rows[0].input as InputPonte), assunzioni };
    const output = calcolaPonte(input);
    await client.query(
      `UPDATE "${nomeSchema}".ponte_temporale
          SET input = $3, output = $4, assunzioni = $5, copertura = $6, avvisi = $7,
              limiti = $8, hash_input = $9, hash_output = $10, stato = 'CALCOLATO',
              note_copertura = $11, updated_at = now()
        WHERE id = $1 AND azienda_id = $2`,
      [
        ponteId,
        aziendaId,
        JSON.stringify(input),
        JSON.stringify(output),
        JSON.stringify(output.assunzioni),
        JSON.stringify(output.copertura),
        JSON.stringify(output.avvisi),
        JSON.stringify(output.limiti),
        calcolaHashInput(input),
        calcolaHashOutput(output),
        output.copertura.componenti.find((c) => c.codice === 'NOTE')?.determinato ? 1 : 0,
      ]
    );
    await client.query(
      `INSERT INTO "${nomeSchema}".ponte_temporale_eventi (ponte_id, tipo, dettaglio, utente)
       VALUES ($1, 'ASSUNZIONI_MODIFICATE', $2, $3)`,
      [ponteId, JSON.stringify({ assunzioni: output.assunzioni.length }), contesto.email ?? null]
    );
    await client.query('COMMIT');
    return { success: true };
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[salvaAssunzioniPonteAction] Errore:', error);
    if (error instanceof ErrorePonte) return { success: false, error: error.message };
    return {
      success: false,
      error: `Impossibile salvare le assunzioni: ${error.message || error}`,
    };
  } finally {
    client.release();
  }
}

export async function confermaPonteAction(
  nomeSchema: string,
  aziendaId: number,
  ponteId: number
): Promise<{ success: boolean; error?: string }> {
  const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId, {
    modulo: ['xbrl'],
    livello: 'SCRITTURA',
  });
  verificaEnte(contesto);
  const client = await pool.connect();
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT id, data_riferimento, stato FROM "${nomeSchema}".ponte_temporale
        WHERE id = $1 AND azienda_id = $2 FOR UPDATE`,
      [ponteId, aziendaId]
    );
    const ponte = r.rows[0];
    if (!ponte) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Piano-ponte non trovato.' };
    }
    if (ponte.stato !== 'CALCOLATO' && ponte.stato !== 'BOZZA') {
      await client.query('ROLLBACK');
      return { success: false, error: 'Solo un Piano-ponte calcolato può essere confermato.' };
    }
    const precedente = await client.query(
      `SELECT id FROM "${nomeSchema}".ponte_temporale
        WHERE azienda_id = $1 AND data_riferimento = $2 AND stato = 'CONFERMATO'
          AND id <> $3 FOR UPDATE`,
      [aziendaId, ponte.data_riferimento, ponteId]
    );
    const precedenteId = precedente.rows[0]?.id ?? null;
    if (precedenteId) {
      await client.query(
        `UPDATE "${nomeSchema}".ponte_temporale
            SET stato = 'SUPERATO', updated_at = now()
          WHERE id = $1 AND azienda_id = $2`,
        [precedenteId, aziendaId]
      );
    }
    await client.query(
      `UPDATE "${nomeSchema}".ponte_temporale
          SET stato = 'CONFERMATO', sostituisce_id = $3, confermato_il = now(),
              confermato_da = $4, updated_at = now()
        WHERE id = $1 AND azienda_id = $2`,
      [ponteId, aziendaId, precedenteId, contesto.email ?? null]
    );
    await client.query(
      `INSERT INTO "${nomeSchema}".ponte_temporale_eventi (ponte_id, tipo, dettaglio, utente)
       VALUES ($1, 'CONFERMATO', $2, $3)`,
      [ponteId, JSON.stringify({ sostituisceId: precedenteId }), contesto.email ?? null]
    );
    await client.query('COMMIT');
    return { success: true };
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[confermaPonteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile confermare il Piano-ponte: ${error.message || error}`,
    };
  } finally {
    client.release();
  }
}

export async function archiviaPonteAction(
  nomeSchema: string,
  aziendaId: number,
  ponteId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId, {
      modulo: ['xbrl'],
      livello: 'SCRITTURA',
    });
    verificaEnte(contesto);
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const r = await pool.query(
      `UPDATE "${nomeSchema}".ponte_temporale
          SET stato = 'ARCHIVIATO', updated_at = now()
        WHERE id = $1 AND azienda_id = $2 AND stato <> 'CONFERMATO'
        RETURNING id`,
      [ponteId, aziendaId]
    );
    if (!r.rows[0]) {
      return {
        success: false,
        error: 'Il Ponte non esiste o è confermato: non si archivia senza una nuova versione.',
      };
    }
    await pool.query(
      `INSERT INTO "${nomeSchema}".ponte_temporale_eventi (ponte_id, tipo, utente)
       VALUES ($1, 'ARCHIVIATO', $2)`,
      [ponteId, contesto.email ?? null]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[archiviaPonteAction] Errore:', error);
    return { success: false, error: `Impossibile archiviare il Ponte: ${error.message || error}` };
  }
}
