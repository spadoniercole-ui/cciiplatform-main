'use server';

// Piano di sviluppo: storico dal bilancio XBRL, rate dalla proposta,
// ipotesi salvate per scenario e variante. Il calcolo e' nel modulo puro.

import { richiediAccessoScenario } from '@/lib/autorizzazione';
import { pool } from '@/lib/db';
import {
  assicuraTabellaXbrlAzienda,
  assicuraTabelleParametriSpazio,
  assicuraTabellaProposta,
  assicuraTabellaPosizioneAggiornata,
} from '@/db/provision';
import { storicoDaStatoAttuale, type PartenzaPiano } from '@/lib/piano/statoAttuale';
import { DATI_VUOTI } from '@/lib/posizioneAggiornata/schemaCampi';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import Anthropic from '@anthropic-ai/sdk';
import { istruzioniLessicoPerPrompt } from '@/lib/lessico/lessico';
import { ottieniScenarioPerId, verificaScenarioNonBloccato } from '@/app/actions/scenari';
import { estraiJson } from '@/lib/visura/fatti';
import { rettifichePulite, applicaRettifiche, type Rettifiche } from '@/lib/piano/rettifiche';
import { ipotesiDaPianoAzienda, valoriPuliti } from '@/lib/piano/pianoAziendale';
import {
  VARIANTE_AI,
  modoRettifiche,
  promptElaborazione,
  validaRettificheAi,
  validaRisposta,
  type ContestoElaborazione,
} from '@/lib/piano/elaborazioneAi';
import {
  ottieniPropostaScenario,
  verificaRicevibilitaProposta,
} from '@/app/actions/propostaScenario';
import {
  rateDaProposta,
  type EsercizioStorico,
  type IpotesiPiano,
  type RatePiano,
} from '@/lib/piano/piano';
import { ORIZZONTE_MASSIMO, type PianoRientro, type TotaleOfferto } from '@/lib/piano/ricevente';
import {
  pianoRientroPulito,
  soluzionePulita,
  type SoluzioneSalvata,
} from '@/lib/piano/riceventeSalvataggio';

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && Number.isFinite(Number(v))
      ? Number(v)
      : 0;

export interface DatiPianoSviluppo {
  /** Dal più recente; in testa lo STATO ATTUALE (posizione aggiornata se più recente del bilancio). */
  storico: EsercizioStorico[];
  partenza: PartenzaPiano;
  rate: RatePiano;
  orizzonte: number;
  ipotesi: IpotesiPiano;
  /** Ricevente: rettifiche delle manopole sul piano dell'azienda. */
  rettifiche: Rettifiche;
  variante: string;
  varianti: string[];
  note: string | null;
  capitaleSociale: number | null;
  salvatoIl: string | null;
  /** Totale offerto dalla proposta: all'ente e agli altri creditori. */
  offerto: TotaleOfferto;
  /** Piano di rientro come lo dice la proposta (risposte proposte alle domande). */
  rientroProposta: PianoRientro;
  /** Piano di rientro scelto per questa variante, se fissato. */
  pianoRientro: PianoRientro | null;
  /** Ricevente: la variante di sistema è accesa accanto al piano dell'azienda. */
  serieSistema: boolean;
  /** Ricevente: soluzione verde salvata con la variante. */
  soluzione: SoluzioneSalvata | null;
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
    const storicoXbrl: EsercizioStorico[] = bil.rows.map((r) => {
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
    // Stato attuale: la posizione aggiornata più recente, se successiva al bilancio.
    await assicuraTabellaPosizioneAggiornata(nomeSchema);
    const pa = await pool.query(
      `SELECT data_riferimento, dati FROM "${nomeSchema}".posizione_aggiornata WHERE scenario_id = $1
       ORDER BY data_riferimento DESC NULLS LAST, updated_at DESC LIMIT 1`,
      [scenarioId]
    );
    const rigaPa = pa.rows[0];
    const { storico, partenza } = storicoDaStatoAttuale(
      storicoXbrl,
      rigaPa?.data_riferimento
        ? {
            dataRiferimento: new Date(rigaPa.data_riferimento).toISOString().slice(0, 10),
            dati: { ...DATI_VUOTI, ...(rigaPa.dati ?? {}) },
          }
        : null
    );
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
    // Ricevente: le righe non si scrivono a mano, vengono dalla lettura della
    // proposta ricevuta (la riga sintetica della posizione dell'ente).
    let righeRate = prop.success ? prop.righe : [];
    if (righeRate.length === 0) {
      const sc = await ottieniScenarioPerId(nomeSchema, scenarioId);
      if (sc.success && sc.scenario?.tipoProposta === 'RICEVUTA') {
        const es = await verificaRicevibilitaProposta(nomeSchema, scenarioId, 'ENTE');
        if (es.success && es.esito && es.esito.datiDisponibili !== false)
          righeRate = es.esito.righe.map((r) => ({
            ...r,
            categoriaCreditore: r.rilevantePerEnte ? 'INPS' : r.categoriaCreditore,
          }));
      }
    }
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
    // Rate sull'orizzonte massimo: l'orizzonte si può allungare a schermo.
    const eEnte = (c: string) =>
      categorieEnte.has(c.trim().toLowerCase()) ||
      /\binps\b|\binail\b|agenzia delle entrate/i.test(c);
    const rate = rateDaProposta(
      righeRate.map((r) => ({
        categoriaCreditore: r.categoriaCreditore,
        importoDovuto: r.importoDovuto,
        percentualeOfferta: r.percentualeOfferta,
        numeroRate: r.numeroRate,
        modalita: r.modalita,
      })),
      ORIZZONTE_MASSIMO,
      eEnte
    );
    // Totale offerto a tutti i creditori e piano di rientro della proposta:
    // il punto di partenza delle domande sul piano di rientro.
    const offerto: TotaleOfferto = { ente: 0, altri: 0 };
    let mesiProposta = 0;
    for (const r of righeRate) {
      const o = (Number(r.importoDovuto) * Number(r.percentualeOfferta)) / 100;
      if (!Number.isFinite(o)) continue;
      if (eEnte(r.categoriaCreditore)) offerto.ente += o;
      else offerto.altri += o;
      if (r.modalita === 'RATEALE' && r.numeroRate)
        mesiProposta = Math.max(mesiProposta, Number(r.numeroRate));
    }
    const rientroProposta: PianoRientro = {
      modalita: mesiProposta > 1 ? 'RATEALE' : 'UNICA',
      mesi: mesiProposta > 1 ? mesiProposta : 0,
      anticipoPct: 0,
    };
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
        partenza,
        rate,
        orizzonte,
        ipotesi: (piano.rows[0]?.ipotesi as IpotesiPiano) ?? {},
        rettifiche: rettifichePulite(piano.rows[0]?.rettifiche),
        variante,
        varianti: varianti.length ? varianti : ['base'],
        note: piano.rows[0]?.note ?? null,
        capitaleSociale: typeof cap === 'number' ? cap : null,
        salvatoIl: piano.rows[0]?.salvato_il
          ? new Date(piano.rows[0].salvato_il).toISOString()
          : null,
        offerto: {
          ente: Math.round(offerto.ente * 100) / 100,
          altri: Math.round(offerto.altri * 100) / 100,
        },
        rientroProposta,
        pianoRientro: pianoRientroPulito(piano.rows[0]?.piano_rientro),
        serieSistema: piano.rows[0]?.serie_sistema === true,
        soluzione: soluzionePulita(piano.rows[0]?.soluzione),
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
  note: string | null,
  rettifiche: Rettifiche | null = null,
  extra: {
    pianoRientro?: PianoRientro | null;
    serieSistema?: boolean;
    soluzione?: SoluzioneSalvata | null;
  } = {}
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
    const o = Math.max(1, Math.min(ORIZZONTE_MASSIMO, Math.round(orizzonte)));
    await assicuraTabelleParametriSpazio(contesto.nomeSchema);
    const rientro = pianoRientroPulito(extra.pianoRientro);
    const sol = soluzionePulita(extra.soluzione);
    await pool.query(
      `INSERT INTO "${contesto.nomeSchema}".piano_sviluppo (scenario_id, variante, orizzonte, ipotesi, note, rettifiche, piano_rientro, serie_sistema, soluzione, salvato_il)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (scenario_id, variante) DO UPDATE SET orizzonte = $3, ipotesi = $4, note = $5, rettifiche = $6,
         piano_rientro = $7, serie_sistema = $8, soluzione = $9, salvato_il = now()`,
      [
        scenarioId,
        v,
        o,
        JSON.stringify(ipotesi),
        note?.trim() || null,
        rettifiche ? JSON.stringify(rettifichePulite(rettifiche)) : null,
        rientro ? JSON.stringify(rientro) : null,
        extra.serieSistema === true,
        sol ? JSON.stringify(sol) : null,
      ]
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
  const orizzonte = Math.max(1, Math.min(ORIZZONTE_MASSIMO, Math.round(n(c.orizzonte))));
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
    ipotesiCorrenti: c.ipotesiCorrenti ?? null,
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
      max_tokens: 6000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: promptElaborazione(c) }],
    });
    const testo = risposta.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const json = estraiJson(testo);
    let esito;
    let rettifiche: Rettifiche | null = null;
    if (modoRettifiche(c)) {
      // Ricevente: rettifiche sul piano dell'azienda; le ipotesi effettive
      // si calcolano qui, così la variante salvata è già completa.
      const pianoAz = valoriPuliti(c.pianoAzienda);
      const ipAz = ipotesiDaPianoAzienda(pianoAz, c.storico[0].anno + 1, c.orizzonte);
      esito = validaRettificheAi(json, Object.keys(pianoAz) as (keyof typeof pianoAz)[]);
      rettifiche = esito.rettifiche ?? {};
      if (Object.keys(rettifiche).length === 0)
        return {
          success: false,
          error: `L’AI non ha prodotto rettifiche utilizzabili${esito.sintesi ? `: ${esito.sintesi}` : '.'} Riprova o gira le manopole a mano.`,
        };
      esito.ipotesi = applicaRettifiche(ipAz, rettifiche, c.ipotesiCorrenti ?? {});
    } else {
      esito = validaRisposta(json, c.orizzonte);
      if (Object.keys(esito.ipotesi).length === 0)
        return {
          success: false,
          error: `L’AI non ha prodotto ipotesi utilizzabili${esito.sintesi ? `: ${esito.sintesi}` : '.'} Riprova o gira le manopole a mano.`,
        };
    }
    await assicuraTabelleParametriSpazio(s);
    const nota = [
      `Ipotesi impostate dall’AI il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}; i risultati li calcola il motore della piattaforma.`,
      esito.sintesi,
      esito.scartati.length
        ? `Valori scartati perché fuori dagli intervalli ammessi: ${esito.scartati.join('; ')}.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    await pool.query(
      `INSERT INTO "${s}".piano_sviluppo (scenario_id, variante, orizzonte, ipotesi, note, rettifiche, salvato_il)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (scenario_id, variante) DO UPDATE SET orizzonte = $3, ipotesi = $4, note = $5, rettifiche = $6, salvato_il = now()`,
      [
        scenarioId,
        VARIANTE_AI,
        c.orizzonte,
        JSON.stringify(esito.ipotesi),
        nota,
        rettifiche ? JSON.stringify(rettifiche) : null,
      ]
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

// ---------------------------------------------------------------------------
// Ricevente: lettura della soluzione verde (0.129)
// ---------------------------------------------------------------------------

/**
 * L'AI scrive la lettura della soluzione trovata dal motore. Riceve solo testi
 * già calcolati (piano dell'azienda, piano di sistema, piano di rientro,
 * soluzione) e non sposta numeri: la soluzione resta quella del motore.
 */
export async function commentaSoluzionePianoAction(
  codiceSpazio: string,
  scenarioId: number,
  testoSoluzione: string,
  contesto: { crescita: string; scostamenti: string[] }
): Promise<{ success: boolean; commento?: string; error?: string }> {
  try {
    const contestoSpazio = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contestoSpazio) return { success: false, error: 'Accesso non valido.' };
    await richiediAccessoScenario(contestoSpazio.nomeSchema, scenarioId, {
      modulo: ['simulazione'],
      livello: 'SCRITTURA',
    });
    const bloccato = await verificaScenarioNonBloccato(contestoSpazio.nomeSchema, scenarioId);
    if (bloccato) return { success: false, error: bloccato };
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
      return {
        success: false,
        error:
          'Chiave API ANTHROPIC_API_KEY non configurata nel server: la soluzione è calcolata, la lettura dell’AI non è disponibile.',
      };
    const testo = String(testoSoluzione ?? '').slice(0, 4000);
    const crescita = String(contesto?.crescita ?? '').slice(0, 400);
    const scostamenti = (Array.isArray(contesto?.scostamenti) ? contesto.scostamenti : [])
      .slice(0, 12)
      .map((s) => String(s).slice(0, 200));
    const prompt = `Sei l'assistente di un funzionario di un ente creditore pubblico che istruisce una proposta di regolazione della crisi d'impresa ricevuta da un'azienda.
Il motore della piattaforma ha messo alla prova il piano dell'azienda e ha calcolato la combinazione di rettifiche più vicina al piano dell'azienda con cui il piano resta verde. Questi sono i risultati, già calcolati:

${testo}

Riferimento di settore: ${crescita || 'non disponibile'}.
Voci del piano dell'azienda più ottimiste del riferimento: ${scostamenti.length ? scostamenti.join('; ') : 'nessuna oltre le soglie'}.

Scrivi in italiano una lettura breve (al massimo 220 parole, 2-3 paragrafi, niente elenchi puntati) per il funzionario:
- che cosa dice la soluzione sul piano dell'azienda e su quali ipotesi poggia;
- quali domande fare all'azienda per verificare che le rettifiche siano raggiungibili;
- che cosa cambia rispetto al piano di sistema.
Regole: usa SOLO i numeri qui sopra, senza ricalcolarli né aggiungerne; non esprimere giudizi riservati al professionista o al tribunale (vedi il lessico sotto); non dire che l'azienda è o non è in crisi; parla di ipotesi da verificare, non di certezze.${istruzioniLessicoPerPrompt()}`;
    const anthropic = new Anthropic({ apiKey, timeout: SCADENZA_AI_MS, maxRetries: 1 });
    const risposta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
    });
    const commento = risposta.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!commento) return { success: false, error: 'L’AI non ha prodotto una lettura.' };
    return { success: true, commento: commento.slice(0, 6000) };
  } catch (error: unknown) {
    console.error('[commentaSoluzionePianoAction]', error);
    return {
      success: false,
      error: `Lettura dell’AI non riuscita: ${(error as Error).message || error}`,
    };
  }
}
