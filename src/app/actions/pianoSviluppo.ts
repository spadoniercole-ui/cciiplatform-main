'use server';

// Piano di sviluppo: storico dal bilancio XBRL, rate dalla proposta,
// ipotesi salvate per scenario e variante. Il calcolo e' nel modulo puro.

import { richiediAccessoScenario } from '@/lib/autorizzazione';
import { pool } from '@/lib/db';
import {
  assicuraTabellaXbrlAzienda,
  assicuraTabelleParametriSpazio,
  assicuraTabellaProposta,
} from '@/db/provision';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import Anthropic from '@anthropic-ai/sdk';
import { verificaScenarioNonBloccato } from '@/app/actions/scenari';
import { estraiJson } from '@/lib/visura/fatti';
import {
  VARIANTE_AI,
  promptElaborazione,
  validaRisposta,
  type ContestoElaborazione,
} from '@/lib/piano/elaborazioneAi';
import { ottieniPropostaScenario } from '@/app/actions/propostaScenario';
import {
  rateDaProposta,
  type EsercizioStorico,
  type IpotesiPiano,
  type RatePiano,
} from '@/lib/piano/piano';

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && Number.isFinite(Number(v))
      ? Number(v)
      : 0;

export interface DatiPianoSviluppo {
  storico: EsercizioStorico[]; // dal piu' recente
  rate: RatePiano;
  orizzonte: number;
  ipotesi: IpotesiPiano;
  variante: string;
  varianti: string[];
  note: string | null;
  capitaleSociale: number | null;
  salvatoIl: string | null;
}

export async function ottieniPianoSviluppoAction(
  nomeSchema: string,
  scenarioId: number,
  aziendaId: number,
  variante = 'base'
): Promise<{ success: boolean; dati?: DatiPianoSviluppo; error?: string }> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaXbrlAzienda(nomeSchema);
    await assicuraTabelleParametriSpazio(nomeSchema);
    await assicuraTabellaProposta(nomeSchema);
    const bil = await pool.query(
      `SELECT anno_bilancio, dati_finanziari FROM "${nomeSchema}".xbrl_storico_azienda WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL ORDER BY anno_bilancio DESC LIMIT 3`,
      [aziendaId]
    );
    const storico: EsercizioStorico[] = bil.rows.map((r) => {
      const d = (r.dati_finanziari ?? {}) as Record<string, unknown>;
      return {
        anno: Number(r.anno_bilancio),
        ricaviVendite: num(d.ricaviVendite),
        valoreProduzione: num(d.valoreProduzione) || num(d.ricaviVendite),
        costiProduzione: num(d.costiProduzione),
        ammortamenti: num(d.ammortamenti),
        oneriFinanziari: num(d.oneriFinanziari),
        utileEsercizio: num(d.utileEsercizio),
        immobilizzazioni: num(d.immobilizzazioni),
        creditiClienti: num(d.creditiClienti),
        disponibilitaLiquide: num(d.disponibilitaLiquide),
        attivoCircolante: num(d.attivoCircolante),
        totaleAttivo: num(d.totaleAttivo),
        patrimonioNetto: num(d.patrimonioNetto),
        debitiBanche: num(d.debitiBanche),
        debitiFornitori: num(d.debitiFornitori),
        debitiTributari: num(d.debitiTributari),
        debitiPrevidenziali: num(d.debitiPrevidenziali),
        totaleDebiti: num(d.totaleDebiti),
      };
    });
    const piano = await pool.query(
      `SELECT * FROM "${nomeSchema}".piano_sviluppo WHERE scenario_id = $1 AND variante = $2`,
      [scenarioId, variante]
    );
    const varianti = (
      await pool.query(
        `SELECT variante FROM "${nomeSchema}".piano_sviluppo WHERE scenario_id = $1 ORDER BY variante`,
        [scenarioId]
      )
    ).rows.map((r) => String(r.variante));
    const orizzonte = piano.rows[0]?.orizzonte ? Number(piano.rows[0].orizzonte) : 5;
    const prop = await ottieniPropostaScenario(nomeSchema, scenarioId);
    // Le categorie dell'ente dello spazio: quelle marcate con un ente 25-novies nei parametri di riscontro.
    let categorieEnte = new Set<string>();
    try {
      const r = await pool.query(
        `SELECT categoria_creditore FROM "${nomeSchema}".limiti_ricevibilita WHERE ente_25novies IS NOT NULL`
      );
      categorieEnte = new Set(
        r.rows.map((x) => String(x.categoria_creditore).trim().toLowerCase())
      );
    } catch {
      /* tabella assente: nessuna categoria dell'ente */
    }
    const rate = rateDaProposta(
      (prop.success ? prop.righe : []).map((r) => ({
        categoriaCreditore: r.categoriaCreditore,
        importoDovuto: r.importoDovuto,
        percentualeOfferta: r.percentualeOfferta,
        numeroRate: r.numeroRate,
        modalita: r.modalita,
      })),
      orizzonte,
      (c) =>
        categorieEnte.has(c.trim().toLowerCase()) ||
        /\binps\b|\binail\b|agenzia delle entrate/i.test(c)
    );
    const scr = await pool
      .query(`SELECT visura_fatti FROM "${nomeSchema}".azienda_screening WHERE azienda_id = $1`, [
        aziendaId,
      ])
      .catch(() => ({ rows: [] as { visura_fatti?: { capitaleSociale?: unknown } }[] }));
    const cap = scr.rows[0]?.visura_fatti?.capitaleSociale;
    return {
      success: true,
      dati: {
        storico,
        rate,
        orizzonte,
        ipotesi: (piano.rows[0]?.ipotesi as IpotesiPiano) ?? {},
        variante,
        varianti: varianti.length ? varianti : ['base'],
        note: piano.rows[0]?.note ?? null,
        capitaleSociale: typeof cap === 'number' ? cap : null,
        salvatoIl: piano.rows[0]?.salvato_il
          ? new Date(piano.rows[0].salvato_il).toISOString()
          : null,
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniPianoSviluppoAction]', error);
    return {
      success: false,
      error: `Impossibile leggere il piano: ${(error as Error).message || error}`,
    };
  }
}

export async function salvaPianoSviluppoAction(
  codiceSpazio: string,
  scenarioId: number,
  variante: string,
  orizzonte: number,
  ipotesi: IpotesiPiano,
  note: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto) return { success: false, error: 'Accesso non valido.' };
    await richiediAccessoScenario(contesto.nomeSchema, scenarioId, {
      modulo: ['simulazione'],
      livello: 'SCRITTURA',
    });
    const v =
      variante
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 30) || 'base';
    const o = Math.max(1, Math.min(5, Math.round(orizzonte)));
    await assicuraTabelleParametriSpazio(contesto.nomeSchema);
    await pool.query(
      `INSERT INTO "${contesto.nomeSchema}".piano_sviluppo (scenario_id, variante, orizzonte, ipotesi, note, salvato_il)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (scenario_id, variante) DO UPDATE SET orizzonte = $3, ipotesi = $4, note = $5, salvato_il = now()`,
      [scenarioId, v, o, JSON.stringify(ipotesi), note?.trim() || null]
    );
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

export async function eliminaVariantePianoAction(
  codiceSpazio: string,
  scenarioId: number,
  variante: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto) return { success: false, error: 'Accesso non valido.' };
    await richiediAccessoScenario(contesto.nomeSchema, scenarioId, {
      modulo: ['simulazione'],
      livello: 'SCRITTURA',
    });
    if (variante === 'base') return { success: false, error: 'La variante «base» non si elimina.' };
    await pool.query(
      `DELETE FROM "${contesto.nomeSchema}".piano_sviluppo WHERE scenario_id = $1 AND variante = $2`,
      [scenarioId, variante]
    );
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Terzo livello: ipotesi scritte dall'AI, calcolo del motore (0.109.117)
// ---------------------------------------------------------------------------

const SCADENZA_AI_MS = 120 * 1000;

function contestoPulito(c: ContestoElaborazione): ContestoElaborazione | null {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  if (!c || (c.lato !== 'RICEVUTA' && c.lato !== 'DA_DEFINIRE')) return null;
  const orizzonte = Math.max(1, Math.min(5, Math.round(n(c.orizzonte))));
  if (!Array.isArray(c.storico) || c.storico.length === 0) return null;
  return {
    lato: c.lato,
    orizzonte,
    storico: c.storico.slice(0, 3).map((s) => ({ ...s, anno: Math.round(n(s.anno)) })),
    crescita: {
      tasso: n(c.crescita?.tasso),
      descrizione: String(c.crescita?.descrizione ?? '').slice(0, 400),
    },
    rate: {
      ente: (c.rate?.ente ?? []).slice(0, orizzonte).map(n),
      altri: (c.rate?.altri ?? []).slice(0, orizzonte).map(n),
    },
    pianoAzienda: c.lato === 'RICEVUTA' ? (c.pianoAzienda ?? null) : null,
    scostamenti: c.lato === 'RICEVUTA' ? (c.scostamenti ?? []).slice(0, 12) : [],
    ipotesiCorrenti: c.lato === 'DA_DEFINIRE' ? (c.ipotesiCorrenti ?? null) : null,
    vincoli: (c.vincoli ?? []).slice(0, 10).map((v) => String(v).slice(0, 200)),
  };
}

/**
 * Una sola chiamata: il contesto arriva già pronto dalla pagina (gli stessi
 * dati che l'operatore ha davanti), la risposta si valida e si salva come
 * variante «elaborazione-ai». Nessuna lettura ripetuta, nessuna seconda
 * chiamata di correzione.
 */
export async function elaboraPianoConAiAction(
  codiceSpazio: string,
  scenarioId: number,
  contesto: ContestoElaborazione
): Promise<{
  success: boolean;
  ipotesi?: IpotesiPiano;
  sintesi?: string;
  scartati?: string[];
  error?: string;
}> {
  try {
    const contestoSpazio = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contestoSpazio) return { success: false, error: 'Accesso non valido.' };
    await richiediAccessoScenario(contestoSpazio.nomeSchema, scenarioId, {
      modulo: ['simulazione'],
      livello: 'SCRITTURA',
    });
    const s = contestoSpazio.nomeSchema;
    const bloccato = await verificaScenarioNonBloccato(s, scenarioId);
    if (bloccato) return { success: false, error: bloccato };
    const c = contestoPulito(contesto);
    if (!c)
      return { success: false, error: 'Dati del piano incompleti: serve almeno un bilancio.' };
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
      return {
        success: false,
        error:
          'Chiave API ANTHROPIC_API_KEY non configurata nel server: l’elaborazione con l’AI non è disponibile.',
      };
    const anthropic = new Anthropic({ apiKey, timeout: SCADENZA_AI_MS, maxRetries: 1 });
    const risposta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: promptElaborazione(c) }],
    });
    const testo = risposta.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const esito = validaRisposta(estraiJson(testo), c.orizzonte);
    if (Object.keys(esito.ipotesi).length === 0)
      return {
        success: false,
        error: `L’AI non ha prodotto ipotesi utilizzabili${esito.sintesi ? `: ${esito.sintesi}` : '.'} Riprova o compila le ipotesi a mano.`,
      };
    await assicuraTabelleParametriSpazio(s);
    const nota = [
      `Ipotesi scritte dall’AI il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}; i risultati li calcola il motore della piattaforma. Ogni cella ha la sua motivazione.`,
      esito.sintesi,
      esito.scartati.length
        ? `Valori scartati perché fuori dagli intervalli ammessi: ${esito.scartati.join('; ')}.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    await pool.query(
      `INSERT INTO "${s}".piano_sviluppo (scenario_id, variante, orizzonte, ipotesi, note, salvato_il)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (scenario_id, variante) DO UPDATE SET orizzonte = $3, ipotesi = $4, note = $5, salvato_il = now()`,
      [scenarioId, VARIANTE_AI, c.orizzonte, JSON.stringify(esito.ipotesi), nota]
    );
    return {
      success: true,
      ipotesi: esito.ipotesi,
      sintesi: esito.sintesi,
      scartati: esito.scartati,
    };
  } catch (error: unknown) {
    console.error('[elaboraPianoConAiAction]', error);
    return {
      success: false,
      error: `Elaborazione con l’AI non riuscita: ${(error as Error).message || error}`,
    };
  }
}
