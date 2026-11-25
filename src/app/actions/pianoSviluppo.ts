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
import type { TipoIstruttoria } from '@/lib/giudice/lettura';
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
  rateDaDebitoAccertato,
  rateDaProposta,
  type EsercizioStorico,
  type IpotesiPiano,
  type RatePiano,
} from '@/lib/piano/piano';
import { ORIZZONTE_MASSIMO, type PianoRientro, type TotaleOfferto } from '@/lib/piano/ricevente';
import {
  lancioDaSalvato,
  lancioPianoValido,
  testoAttenzioneContabile,
  vincoliDaAttenzioneContabile,
  type LancioPiano,
} from '@/lib/piano/contestoContabile';
import { ottieniEsitoVerificaAction } from '@/app/actions/esitoVerifica';
import { leggiParametriSimulazione } from '@/lib/piano/letturaParametriSimulazione';
import { leggiParametriContesto } from '@/lib/piano/letturaParametriContesto';
import { testoParametriContesto } from '@/lib/piano/parametriContesto';
import {
  pianoVerificaDaColonne,
  testoPianoVerifica,
  type AnnoPianoVerifica,
} from '@/lib/piano/pianoDaVerifica';
import {
  testoLeve,
  leveValide,
  leveDaSalvate,
  type LeveSimulazione,
} from '@/lib/piano/leveSimulazione';
import type { ParametriSimulazionePiano } from '@/lib/piano/parametriSimulazione';
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
  /** Le rate non vengono dalla proposta ma dal debito accertato (0.256.28). */
  rateDaDebito?: boolean;
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
  /**
   * Il debito da restituire con il piano, quando la proposta non lo dice: la
   * cifra accertata dalla verifica amministrativa (memorizzata) o, in mancanza,
   * la somma delle posizioni dell'ente. null = nessuna cifra disponibile.
   */
  debitoTarget: number | null;
  /** La situazione dello scenario: con il flag di simulazione la procedura non si sceglie. */
  tipoIstruttoria: TipoIstruttoria | null;
  /** Piano di rientro come lo dice la proposta (risposte proposte alle domande). */
  rientroProposta: PianoRientro;
  /** Piano di rientro scelto per questa variante, se fissato. */
  pianoRientro: PianoRientro | null;
  /** Ricevente: la variante di sistema è accesa accanto al piano dell'azienda. */
  serieSistema: boolean;
  /** Ricevente: soluzione verde salvata con la variante. */
  soluzione: SoluzioneSalvata | null;
  /** Le leve della simulazione (Parametri › Piano e simulazione AI). */
  parametri: ParametriSimulazionePiano;
  /**
   * true quando lo scenario è nato con il flag di simulazione: il piano di
   * sviluppo poggia sul passo 3 della verifica aziendale (e sul confronto con
   * il piano dell'azienda, per il Ricevente).
   */
  simulazioneAttiva: boolean;
  /**
   * Il piano dell'azienda che arriva dalla verifica aziendale, quando il flag è
   * attivo: le annualità salvate nel prospetto. Vuoto quando non ce n'è.
   */
  pianoVerifica: AnnoPianoVerifica[];
  /** Il contesto economico dello spazio (Parametri › Piano e simulazione AI). */
  parametriContesto: number;
  /**
   * Le leve con cui questa variante è stata prodotta, come sono state salvate:
   * null quando la variante non ne ha (nata prima che si registrassero).
   */
  leve: LeveSimulazione | null;
  /**
   * Il lancio salvato con la variante — procedura, offerta, anni di
   * restituzione, impostazione. Null quando la variante non ne ha.
   */
  lancio: LancioPiano | null;
  /** true quando questa variante è il progetto del piano: definitiva. */
  progetto: boolean;
  /** Quando la variante è diventata progetto. */
  progettoIl: string | null;
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
    const { parametri } = await leggiParametriSimulazione(nomeSchema);
    // Senza un orizzonte salvato vale quello dello spazio, non un 5 scritto qui.
    const orizzonte = piano.rows[0]?.orizzonte
      ? Number(piano.rows[0].orizzonte)
      : parametri.orizzonteDefault;
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
    // IL FLAG DI SIMULAZIONE E IL PIANO DELLA VERIFICA AZIENDALE (0.256.18).
    // Con il flag acceso lo scenario lavora sul piano che l'azienda ha già
    // messo a disposizione nel passo 3 della verifica: si legge quello, e si
    // dichiara se non c'è, invece di far credere che il piano parta dal nulla.
    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId).catch(() => null);
    const simulazioneAttiva = scenarioRis?.success
      ? Boolean(scenarioRis.scenario?.simulazioneAttiva)
      : false;
    const tipoIstruttoria = scenarioRis?.success
      ? ((scenarioRis.scenario?.tipoIstruttoria ?? null) as TipoIstruttoria | null)
      : null;
    // Il debito da restituire: la verifica amministrativa lo ha già accertato.
    // Serve al piano di rientro quando la proposta non porta righe (0.256.21).
    const debitoTarget = await (async (): Promise<number | null> => {
      const mem = await pool
        .query(`SELECT totale FROM "${nomeSchema}".debiti_ente_memorizzati WHERE azienda_id = $1`, [
          aziendaId,
        ])
        .catch(() => ({ rows: [] as { totale: string | number }[] }));
      const memorizzato = num(mem.rows[0]?.totale);
      if (memorizzato > 0) return memorizzato;
      const posizioni = await pool
        .query(
          `SELECT COALESCE(SUM(importo), 0) AS totale FROM "${nomeSchema}".debiti_ente
            WHERE azienda_id = $1 AND scenario_id IS NULL`,
          [aziendaId]
        )
        .catch(() => ({ rows: [] as { totale: string | number }[] }));
      const somma = num(posizioni.rows[0]?.totale);
      return somma > 0 ? somma : null;
    })();
    let pianoVerifica: AnnoPianoVerifica[] = [];
    if (simulazioneAttiva) {
      const va = await pool
        .query(
          `SELECT colonne FROM "${nomeSchema}".verifica_azienda_simulazioni
            WHERE azienda_id = $1 ORDER BY base_per_proposta DESC, id DESC LIMIT 1`,
          [aziendaId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      pianoVerifica = pianoVerificaDaColonne(va.rows[0]?.colonne);
    }
    // LA RESTITUZIONE DEL DEBITO NON PUÒ RESTARE A ZERO. Se la proposta non
    // porta rate e il debito accertato c'è, il piano lo restituisce comunque
    // sugli anni dell'orizzonte: altrimenti si leggerebbe «restituzione in 5
    // anni» accanto a rate a zero.
    const haRateDaProposta = rate.ente.concat(rate.altri).some((v) => v > 0);
    const rateFinali =
      !haRateDaProposta && debitoTarget !== null && debitoTarget > 0
        ? { ente: rateDaDebitoAccertato(debitoTarget, orizzonte), altri: rate.altri }
        : rate;
    const rateDaDebito = !haRateDaProposta && debitoTarget !== null && debitoTarget > 0;
    const contesto = await leggiParametriContesto(nomeSchema).catch(() => []);
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
        rate: rateFinali,
        rateDaDebito,
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
        debitoTarget,
        tipoIstruttoria,
        rientroProposta,
        pianoRientro: pianoRientroPulito(piano.rows[0]?.piano_rientro),
        serieSistema: piano.rows[0]?.serie_sistema === true,
        soluzione: soluzionePulita(piano.rows[0]?.soluzione),
        parametri,
        simulazioneAttiva,
        pianoVerifica,
        parametriContesto: contesto.filter((c) => c.valore.length > 0).length,
        leve: leveDaSalvate(piano.rows[0]?.leve),
        lancio: lancioDaSalvato(piano.rows[0]?.lancio),
        progetto: piano.rows[0]?.progetto === true,
        progettoIl: piano.rows[0]?.progetto_il
          ? new Date(piano.rows[0].progetto_il).toISOString()
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
  note: string | null,
  rettifiche: Rettifiche | null = null,
  extra: {
    pianoRientro?: PianoRientro | null;
    serieSistema?: boolean;
    soluzione?: SoluzioneSalvata | null;
    /** Le leve del lancio: restano con la variante, così la simulazione le ricorda. */
    leve?: LeveSimulazione | null;
    /** Il lancio (procedura, offerta, anni, impostazione), salvato con la variante. */
    lancio?: LancioPiano | null;
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
    // Il progetto è definitivo: non si sovrascrive con un salvataggio normale.
    // Per cambiarlo si crea una nuova variante e la si fa progetto, così resta
    // la traccia di che cosa era stato depositato.
    const esistente = await pool.query(
      `SELECT progetto FROM "${contesto.nomeSchema}".piano_sviluppo WHERE scenario_id = $1 AND variante = $2`,
      [scenarioId, v]
    );
    if (esistente.rows[0]?.progetto === true)
      return {
        success: false,
        error:
          'Questa variante è il progetto del piano: è definitiva e non si modifica. Crea una nuova variante da questa e fanne il nuovo progetto.',
      };
    // Le leve si salvano solo se il browser le manda: se non arrivano (un
    // salvataggio che non le conosce) restano quelle già registrate.
    const leve = extra.leve ? JSON.stringify(leveValide(extra.leve)) : null;
    const lancio = extra.lancio ? JSON.stringify(lancioPianoValido(extra.lancio)) : null;
    await pool.query(
      `INSERT INTO "${contesto.nomeSchema}".piano_sviluppo (scenario_id, variante, orizzonte, ipotesi, note, rettifiche, piano_rientro, serie_sistema, soluzione, leve, lancio, salvato_il)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (scenario_id, variante) DO UPDATE SET orizzonte = $3, ipotesi = $4, note = $5, rettifiche = $6,
         piano_rientro = $7, serie_sistema = $8, soluzione = $9, leve = COALESCE($10, piano_sviluppo.leve),
         lancio = COALESCE($11, piano_sviluppo.lancio), salvato_il = now()`,
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
        leve,
        lancio,
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
    const r = await pool.query(
      `DELETE FROM "${contesto.nomeSchema}".piano_sviluppo
        WHERE scenario_id = $1 AND variante = $2 AND progetto = FALSE`,
      [scenarioId, variante]
    );
    if (r.rowCount === 0)
      return {
        success: false,
        error: 'Questa variante è il progetto del piano: è definitiva e non si cancella.',
      };
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/**
 * IL PROGETTO DEL PIANO (0.256.31). La variante scelta come progetto diventa
 * definitiva: non si cancella e non si sovrascrive. Una sola per scenario: se
 * un'altra lo era, smette di esserlo (resta come variante modificabile), perché
 * un piano ha un progetto e non due.
 */
export async function rendiProgettoPianoAction(
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
    await assicuraTabelleParametriSpazio(contesto.nomeSchema);
    const v =
      variante
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 30) || 'base';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE "${contesto.nomeSchema}".piano_sviluppo SET progetto = FALSE, progetto_il = NULL
          WHERE scenario_id = $1 AND progetto = TRUE`,
        [scenarioId]
      );
      const r = await client.query(
        `UPDATE "${contesto.nomeSchema}".piano_sviluppo SET progetto = TRUE, progetto_il = now()
          WHERE scenario_id = $1 AND variante = $2`,
        [scenarioId, v]
      );
      if (r.rowCount === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'La variante non esiste: salvala prima di farne il progetto.',
        };
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Il progetto non è stato salvato: ${(error as Error).message || error}`,
    };
  }
}

// ---------------------------------------------------------------------------
// L'ATTENZIONE DELLA CONTABILE COME CONTESTO DELLA SIMULAZIONE (0.256.14)
//
// Il riquadro «Dove si concentra l'attenzione» della verifica contabile non
// resta una lettura da guardare: entra nella simulazione del piano, perché dice
// all'AI su che cosa il piano deve rispondere (struttura, dinamica, affidabilità
// dei dati, quadro procedurale) e con quali lacune fare i conti. Quali
// dimensioni entrano lo decide la soglia dello spazio
// (Parametri › Piano e simulazione AI).
//
// Se la contabile non è leggibile (o chi simula non è Admin di spazio), la
// simulazione funziona come prima: `disponibile: false`, nessun vincolo
// inventato.
// ---------------------------------------------------------------------------

export interface RisultatoAttenzioneContabile {
  success: boolean;
  /** Il riquadro dell'attenzione in testo, per il prompt. */
  testo?: string;
  /** I vincoli che il piano deve rispettare. */
  vincoli?: string[];
  /** La soglia dello spazio con cui si è deciso quali dimensioni entrano. */
  soglia?: number;
  /** false quando la contabile non è leggibile: la simulazione va avanti senza. */
  disponibile?: boolean;
  error?: string;
}

export async function ottieniAttenzioneContabilePianoAction(
  codiceSpazio: string,
  scenarioId: number,
  aziendaId: number
): Promise<RisultatoAttenzioneContabile> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto) return { success: false, error: 'Accesso non valido.' };
    await richiediAccessoScenario(contesto.nomeSchema, scenarioId);
    const { parametri } = await leggiParametriSimulazione(contesto.nomeSchema);
    const soglia = parametri.intensitaMinimaAttenzione;
    const esito = await ottieniEsitoVerificaAction(
      contesto.nomeSchema,
      aziendaId,
      contesto.tipoSpazio
    );
    if (!esito.success || !esito.esito)
      return { success: true, disponibile: false, testo: '', vincoli: [], soglia };
    const input = {
      esito: esito.esito,
      debitoInBilancio: esito.debitoInBilancio ?? null,
    };
    return {
      success: true,
      disponibile: true,
      testo: testoAttenzioneContabile(input, soglia),
      vincoli: vincoliDaAttenzioneContabile(input, soglia),
      soglia,
    };
  } catch (error: unknown) {
    console.error('[ottieniAttenzioneContabilePianoAction]', error);
    return {
      success: false,
      error: `Attenzione della contabile non leggibile: ${(error as Error).message}`,
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
    attenzioneContabile: c.attenzioneContabile
      ? String(c.attenzioneContabile).slice(0, 4000)
      : null,
    lancio: c.lancio ? String(c.lancio).slice(0, 1000) : null,
    // Le leve del lancio (0.256.18): testo già composto da `testoLeve`, come
    // lo legge l'AI. Gli altri due blocchi li riempie il server qui sotto.
    leve: c.leve ? String(c.leve).slice(0, 1500) : null,
    parametriContesto: c.parametriContesto ? String(c.parametriContesto).slice(0, 4000) : null,
    pianoVerifica: c.pianoVerifica ? String(c.pianoVerifica).slice(0, 4000) : null,
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
    // Le leve del lancio (0.256.19): una sola fonte, `leveScelte`. Da qui il
    // testo per il prompt e, più sotto, il jsonb salvato con la variante: la
    // simulazione ricorda con quali leve è stata prodotta.
    const leveScelte = leveValide(contesto.leveScelte);
    c.leve = testoLeve(leveScelte) || null;
    // IL CONTESTO ECONOMICO E IL PIANO DELLA VERIFICA (0.256.18) si leggono
    // qui: sono dati dello spazio e dell'azienda, non del browser. Il contesto
    // vale per tutte le aziende (Parametri), il piano della verifica solo se lo
    // scenario è nato con il flag di simulazione.
    c.parametriContesto =
      testoParametriContesto(await leggiParametriContesto(s).catch(() => [])) || null;
    const scenarioCorrente = await ottieniScenarioPerId(s, scenarioId).catch(() => null);
    if (scenarioCorrente?.success && scenarioCorrente.scenario?.simulazioneAttiva) {
      const va = await pool
        .query(
          `SELECT colonne FROM "${s}".verifica_azienda_simulazioni
            WHERE azienda_id = $1 ORDER BY base_per_proposta DESC, id DESC LIMIT 1`,
          [scenarioCorrente.scenario.aziendaId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      c.pianoVerifica = testoPianoVerifica(pianoVerificaDaColonne(va.rows[0]?.colonne)) || null;
    } else {
      c.pianoVerifica = null;
    }
    // Le leve dello spazio (Parametri › Piano e simulazione AI): l'AI scrive le
    // ipotesi dentro questi limiti, e l'aliquota che non decide è quella
    // dell'ente, non il 27,9% implicito nel motore.
    const { parametri } = await leggiParametriSimulazione(s);
    const opzioni = {
      variazioneMassimaPct: parametri.variazioneMassimaPct,
      aliquotaImposteDefault: parametri.aliquotaImposteDefault,
    };
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
      messages: [{ role: 'user', content: promptElaborazione(c, opzioni) }],
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
      esito = validaRettificheAi(json, Object.keys(pianoAz) as (keyof typeof pianoAz)[], opzioni);
      rettifiche = esito.rettifiche ?? {};
      if (Object.keys(rettifiche).length === 0)
        return {
          success: false,
          error: `L’AI non ha prodotto rettifiche utilizzabili${esito.sintesi ? `: ${esito.sintesi}` : '.'} Riprova o gira le manopole a mano.`,
        };
      esito.ipotesi = applicaRettifiche(ipAz, rettifiche, c.ipotesiCorrenti ?? {});
    } else {
      esito = validaRisposta(json, c.orizzonte, opzioni);
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
    // Le leve e il lancio che l'AI propone si salvano con la variante: sono
    // la sua risposta alla domanda «come si fa fronte agli impegni con l'ente».
    // Se il modello non le scrive restano quelle scelte nel pannello.
    const leveFinali = esito.leve ?? leveScelte;
    const lancioFinale = esito.lancio ?? null;
    await pool.query(
      `INSERT INTO "${s}".piano_sviluppo (scenario_id, variante, orizzonte, ipotesi, note, rettifiche, leve, lancio, salvato_il)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (scenario_id, variante) DO UPDATE SET orizzonte = $3, ipotesi = $4, note = $5, rettifiche = $6,
         leve = $7, lancio = COALESCE($8, piano_sviluppo.lancio), salvato_il = now()`,
      [
        scenarioId,
        VARIANTE_AI,
        c.orizzonte,
        JSON.stringify(esito.ipotesi),
        nota,
        rettifiche ? JSON.stringify(rettifiche) : null,
        JSON.stringify(leveFinali),
        lancioFinale ? JSON.stringify(lancioFinale) : null,
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
