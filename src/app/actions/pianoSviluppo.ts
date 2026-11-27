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
import { erroreServizioEsterno, messaggioChiaveAiMancante } from '@/lib/serviziEsterni';
import { consumaQuotaAi } from '@/lib/limiteAi';
import { ottieniScenarioPerId, verificaScenarioNonBloccato } from '@/app/actions/scenari';
import type { TipoIstruttoria } from '@/lib/giudice/lettura';
import { estraiJson } from '@/lib/visura/fatti';
import { rettifichePulite, applicaRettifiche, type Rettifiche } from '@/lib/piano/rettifiche';
import { ipotesiDaPianoAzienda, valoriPuliti } from '@/lib/piano/pianoAziendale';
import {
  PREFISSO_SINTESI_NOTA,
  VARIANTE_AI,
  VARIAZIONE_MASSIMA_PREDEFINITA,
  modoRettifiche,
  promptElaborazione,
  validaRettificheAi,
  validaRisposta,
  type ContestoElaborazione,
} from '@/lib/piano/elaborazioneAi';
import { nomeArchivioElaborazione } from '@/lib/piano/variantiPiano';
import {
  cercaPiano,
  notaRicerca,
  ricercaDaSalvare,
  ricercaPulita,
  type RicercaSalvata,
} from '@/lib/piano/ricercaPiano';
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
  LANCIO_PIANO_PREDEFINITO,
  lancioDaSalvato,
  lancioPianoValido,
  testoAttenzioneContabile,
  vincoliDaAttenzioneContabile,
  type LancioPiano,
} from '@/lib/piano/contestoContabile';
import { ottieniEsitoVerificaAction } from '@/app/actions/esitoVerifica';
import { noteIntegrativeReport } from '@/lib/contabile/reportContabile';
import type { FactTestuale } from '@/lib/xbrl/types';
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
  leveAccese,
  type LeveSimulazione,
} from '@/lib/piano/leveSimulazione';
import type { ParametriSimulazionePiano } from '@/lib/piano/parametriSimulazione';
import { istantaneaParametriInVigore } from '@/lib/triage/letturaParametriScenari';
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
   * Il dovuto della proposta, all'ente e agli altri creditori: è la base su cui
   * si calcola la percentuale d'offerta che il lancio riporta.
   */
  dovuto: TotaleOfferto;
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
  /**
   * La ricerca che ha prodotto il piano (0.256.42): le manopole girate dal
   * motore dopo la proposta dell'analisi e i vincoli che restano aperti. Null
   * per le varianti scritte a mano.
   */
  ricerca: RicercaSalvata | null;
  /**
   * true quando la variante ha una riga sua: la «base» vive nel browser finché
   * non si salva, e `varianti` la elenca anche quando non esiste (0.256.32).
   */
  salvata: boolean;
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
        costiPersonale: num(d.costiPersonale) > 0 ? num(d.costiPersonale) : null,
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
    const dovuto: TotaleOfferto = { ente: 0, altri: 0 };
    let mesiProposta = 0;
    for (const r of righeRate) {
      const d = Number(r.importoDovuto);
      if (Number.isFinite(d)) {
        if (eEnte(r.categoriaCreditore)) dovuto.ente += d;
        else dovuto.altri += d;
      }
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
        dovuto: {
          ente: Math.round(dovuto.ente * 100) / 100,
          altri: Math.round(dovuto.altri * 100) / 100,
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
        ricerca: ricercaPulita(piano.rows[0]?.ricerca),
        salvata: piano.rows.length > 0,
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
 * Lo stato del pannello, quando la variante non ha ancora una riga nel
 * database: è il caso della «base», che finché non si salva vive solo nel
 * browser. Il server lo valida con le stesse funzioni del salvataggio normale.
 */
export interface IstantaneaProgetto {
  orizzonte: number;
  ipotesi: IpotesiPiano;
  note?: string | null;
  rettifiche?: Rettifiche | null;
  pianoRientro?: PianoRientro | null;
  serieSistema?: boolean;
  soluzione?: SoluzioneSalvata | null;
  leve?: LeveSimulazione | null;
  lancio?: LancioPiano | null;
}

/**
 * IL PROGETTO DEL PIANO (0.256.31). La variante scelta come progetto diventa
 * definitiva: non si cancella e non si sovrascrive. Una sola per scenario: se
 * un'altra lo era, smette di esserlo (resta come variante modificabile), perché
 * un piano ha un progetto e non due.
 *
 * 0.256.32: anche la «base» può diventarlo. Non ha una riga finché non si
 * salva, perciò lo stato del pannello arriva qui (`istantanea`) e si salva
 * prima di rendere la variante definitiva: il progetto è quello che si vede a
 * schermo, non una variante vuota.
 */
export async function rendiProgettoPianoAction(
  codiceSpazio: string,
  scenarioId: number,
  variante: string,
  istantanea?: IstantaneaProgetto
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
    const esistente = await pool.query(
      `SELECT 1 FROM "${contesto.nomeSchema}".piano_sviluppo WHERE scenario_id = $1 AND variante = $2`,
      [scenarioId, v]
    );
    if (esistente.rowCount === 0) {
      if (!istantanea)
        return {
          success: false,
          error: 'La variante non è ancora salvata: salvala prima di farne il progetto.',
        };
      const salvataggio = await salvaPianoSviluppoAction(
        codiceSpazio,
        scenarioId,
        v,
        istantanea.orizzonte,
        istantanea.ipotesi,
        istantanea.note ?? null,
        istantanea.rettifiche ?? null,
        {
          pianoRientro: istantanea.pianoRientro ?? null,
          serieSistema: istantanea.serieSistema === true,
          soluzione: istantanea.soluzione ?? null,
          leve: istantanea.leve ?? null,
          lancio: istantanea.lancio ?? null,
        }
      );
      if (!salvataggio.success) return salvataggio;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE "${contesto.nomeSchema}".piano_sviluppo SET progetto = FALSE, progetto_il = NULL
          WHERE scenario_id = $1 AND progetto = TRUE`,
        [scenarioId]
      );
      // Il progetto nasce con le percentuali degli scenari del giorno
      // (0.256.33): restano con lui, così una versione pubblicata dopo non
      // riscrive i numeri di un piano già depositato.
      const congelati = await istantaneaParametriInVigore(contesto.nomeSchema).catch(() => null);
      const r = await client.query(
        `UPDATE "${contesto.nomeSchema}".piano_sviluppo
            SET progetto = TRUE, progetto_il = now(), parametri_versione = $3
          WHERE scenario_id = $1 AND variante = $2`,
        [scenarioId, v, congelati ? JSON.stringify(congelati) : null]
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
// L'elaborazione del piano fa anche la ricerca web (0.256.34): sei ricerche
// più la scrittura della risposta non stanno nei due minuti buoni della
// lettura di una sintesi.
const SCADENZA_ELABORAZIONE_MS = 240 * 1000;

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
    // Le leve toccate dall'operatore (0.256.34): il prompt lo deve sapere,
    // altrimenti propone una misura che poi il server scarta.
    leveModificate: c.leveModificate === true,
    parametriContesto: c.parametriContesto ? String(c.parametriContesto).slice(0, 4000) : null,
    pianoVerifica: c.pianoVerifica ? String(c.pianoVerifica).slice(0, 4000) : null,
    noteIntegrative: c.noteIntegrative ? String(c.noteIntegrative).slice(0, 6000) : null,
    minAnni: Math.max(0, Math.min(ORIZZONTE_MASSIMO, Math.round(n(c.minAnni)))),
    // Gli anni e l'offerta scritti nel lancio sono decisioni dell'operatore:
    // l'elaborazione li tiene (0 anni = unica soluzione).
    anniFissi:
      typeof c.anniFissi === 'number' && Number.isFinite(c.anniFissi)
        ? Math.max(0, Math.min(ORIZZONTE_MASSIMO, Math.round(c.anniFissi)))
        : null,
    offertaFissa:
      typeof c.offertaFissa === 'number' && Number.isFinite(c.offertaFissa)
        ? Math.max(0, Math.min(100, c.offertaFissa))
        : null,
    impostazione: c.impostazione ? String(c.impostazione).slice(0, 20) : null,
    procedura: c.procedura ? String(c.procedura).slice(0, 20) : null,
    vincoli: (c.vincoli ?? []).slice(0, 10).map((v) => String(v).slice(0, 200)),
    vincoliDocumentati: (c.vincoliDocumentati ?? [])
      .slice(0, 10)
      .map((v) => String(v).slice(0, 200)),
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
  ricerca?: RicercaSalvata;
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
    // IL PROGETTO NON SI SOVRASCRIVE CON UNA NUOVA ELABORAZIONE (0.256.32).
    // Se la variante «elaborazione-ai» è il progetto del piano è definitiva,
    // come lo è per il salvataggio a mano. Il controllo sta prima della
    // chiamata al modello, così l'utente non aspetta per un rifiuto.
    await assicuraTabelleParametriSpazio(s);
    const varianteAi = await pool.query(
      `SELECT progetto FROM "${s}".piano_sviluppo WHERE scenario_id = $1 AND variante = $2`,
      [scenarioId, VARIANTE_AI]
    );
    if (varianteAi.rows[0]?.progetto === true)
      return {
        success: false,
        error:
          'La variante «elaborazione-ai» è il progetto del piano: è definitiva e una nuova elaborazione non la sovrascrive. Crea una nuova variante da questa e fanne il progetto.',
      };
    const c = contestoPulito(contesto);
    if (!c)
      return { success: false, error: 'Dati del piano incompleti: serve almeno un bilancio.' };
    // LA CHIAVE E LA QUOTA, PRIMA DI OGNI LAVORO (0.256.49). La chiave assente è
    // un caso previsto, non un errore tecnico: il messaggio dice dove si mette
    // (nella demo locale `.env.local`, nella portable `apikey.txt`).
    // L'elaborazione è una chiamata AI a pagamento con ricerca web e la sola
    // sessione basta a farla partire: passa dal tetto d'uso come le visure e i
    // riscontri. La quota si consuma dopo i controlli che non costano nulla
    // (scenario bloccato, variante «elaborazione-ai» già progetto, contesto
    // completo) e prima del modello: un rifiuto non fa aspettare e non spende.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { success: false, error: messaggioChiaveAiMancante() };
    const quota = await consumaQuotaAi(pool, 'PIANO', {
      utente: contestoSpazio.email || `spazio:${contestoSpazio.spazioId}`,
      spazioId: contestoSpazio.spazioId,
    });
    if (!quota.consentito)
      return {
        success: false,
        error: quota.error ?? 'Limite di elaborazioni del piano raggiunto: riprova più tardi.',
      };
    // Le leve del lancio (0.256.19): una sola fonte, `leveScelte`. Da qui il
    // testo per il prompt e, più sotto, il jsonb salvato con la variante: la
    // simulazione ricorda con quali leve è stata prodotta.
    const leveScelte = leveValide(contesto.leveScelte);
    c.leve = testoLeve(leveScelte) || null;
    c.leveModificate = contesto.leveModificate === true;
    // IL CONTESTO ECONOMICO E IL PIANO DELLA VERIFICA (0.256.18) si leggono
    // qui: sono dati dello spazio e dell'azienda, non del browser. Il contesto
    // vale per tutte le aziende (Parametri), il piano della verifica solo se lo
    // scenario è nato con il flag di simulazione.
    c.parametriContesto =
      testoParametriContesto(await leggiParametriContesto(s).catch(() => [])) || null;
    const scenarioCorrente = await ottieniScenarioPerId(s, scenarioId).catch(() => null);
    // LE NOTE INTEGRATIVE (0.256.35): il piano non si costruisce solo sulle
    // macro-voci. Continuità, piani, fatti di rilievo, impegni e parti correlate
    // sono il documento che spiega i numeri, e l'analisi li legge.
    c.noteIntegrative = null;
    if (scenarioCorrente?.success && scenarioCorrente.scenario?.aziendaId) {
      const noteRis = await pool
        .query(
          `SELECT note_fatti FROM "${s}".xbrl_storico_azienda
            WHERE azienda_id = $1 AND note_fatti IS NOT NULL
            ORDER BY anno_bilancio DESC NULLS LAST LIMIT 1`,
          [scenarioCorrente.scenario.aziendaId]
        )
        .catch(() => ({ rows: [] as { note_fatti?: unknown }[] }));
      const fatti = Array.isArray(noteRis.rows[0]?.note_fatti)
        ? (noteRis.rows[0]!.note_fatti as FactTestuale[])
        : null;
      const note = noteIntegrativeReport(fatti).note;
      const testo = note
        .map((n) => `${n.titolo}: ${n.testo}`)
        .join('\n\n')
        .slice(0, 6000);
      c.noteIntegrative = testo || null;
    }
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
    // Chiave e quota sono già state verificate qui sopra: da qui in poi la
    // chiamata è consentita.
    const anthropic = new Anthropic({ apiKey, timeout: SCADENZA_ELABORAZIONE_MS, maxRetries: 1 });
    // LA RICERCA WEB (0.256.34). L'ambiente — situazione internazionale,
    // stabilità politica, mercati emergenti, energia, tassi, cambi — non sta
    // nei bilanci dell'azienda. Le ipotesi che ne dipendono devono poggiare su
    // fonti lette, non sulla memoria del modello: è il lavoro che un operatore
    // da solo non riuscirebbe a fare su tutte quelle variabili insieme.
    const messaggi: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: promptElaborazione(c, opzioni) },
    ];
    let risposta: Anthropic.Messages.Message | null = null;
    for (let giro = 0; giro < 3; giro++) {
      risposta = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 6000,
        thinking: { type: 'disabled' },
        messages: messaggi,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
      });
      if (risposta.stop_reason !== 'pause_turn') break;
      // La ricerca può sospendere il turno: si riprende da quello che il
      // modello ha già prodotto, senza rimandargli il prompt da capo.
      messaggi.push({ role: 'assistant', content: risposta.content });
    }
    if (!risposta)
      return { success: false, error: 'L’elaborazione con l’AI non ha prodotto una risposta.' };
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
    // Le leve e il lancio che l'AI propone si salvano con la variante: sono
    // la sua risposta alla domanda «come si fa fronte agli impegni con l'ente».
    // Se il modello non le scrive restano quelle scelte nel pannello.
    //
    // LE VARIABILI DELL'OPERATORE NON SI TOCCANO (0.256.34): se le ha già
    // cambiate, la proposta dell'analisi non le riscrive. La sintesi dice che
    // cosa l'analisi avrebbe proposto, così la scelta resta sua.
    const leveFinali = c.leveModificate ? leveScelte : (esito.leve ?? leveScelte);
    // LA RICERCA DEL PIANO (0.256.42). L'analisi scrive il punto di partenza,
    // il motore gira le manopole a piccoli passi — crescita dei ricavi, costi,
    // leve — finché rate, cassa e patrimonio stanno in piedi, e restituisce il
    // piano che ci arriva insieme alla traccia delle mosse. Se non ci arriva,
    // lo dice: non gonfia i numeri oltre i limiti dello spazio.
    const capitaleSociale = await (async (): Promise<number | null> => {
      const aziendaId = scenarioCorrente?.success ? scenarioCorrente.scenario?.aziendaId : null;
      if (!aziendaId) return null;
      const r = await pool
        .query(`SELECT visura_fatti FROM "${s}".azienda_screening WHERE azienda_id = $1`, [
          aziendaId,
        ])
        .catch(() => ({ rows: [] as { visura_fatti?: { capitaleSociale?: unknown } }[] }));
      const cap = r.rows[0]?.visura_fatti?.capitaleSociale;
      return typeof cap === 'number' && Number.isFinite(cap) ? cap : null;
    })();
    const ricerca = cercaPiano({
      storico: c.storico[0],
      orizzonte: c.orizzonte,
      rate: { ente: c.rate.ente, altri: c.rate.altri },
      capitaleSociale,
      ipotesiIniziali: esito.ipotesi,
      leveIniziali: leveFinali,
      variazioneMassimaPct: opzioni.variazioneMassimaPct ?? VARIAZIONE_MASSIMA_PREDEFINITA,
      // Solo i vincoli documentati possono lasciare i ricavi fermi: i vincoli
      // aperti del piano in schermo sono proprio quelli da chiudere.
      vincoliDocumentati: c.vincoliDocumentati,
      // Con il piano dell'azienda rettificato il percorso di ricavi e costi è
      // quello rettificato: la ricerca agisce sulle leve.
      percorsoFisso: modoRettifiche(c),
      leveBloccate: c.leveModificate,
    });
    esito.ipotesi = ricerca.ipotesi;
    const levePiano = ricerca.leve;
    const ricercaSalvata = ricercaDaSalvare(ricerca);
    const propostaScartata =
      c.leveModificate && esito.leve
        ? `Le leve erano già state scelte dall’operatore: la proposta dell’analisi (${
            leveAccese(esito.leve)
              .map((l) => `${l.domanda} ${l.pct}%`)
              .join(', ') || 'nessuna leva accesa'
          }) non le ha sostituite.`
        : '';
    // La restituzione del debito non può essere più lunga del piano: se gli anni
    // superano l'orizzonte, si tiene l'orizzonte e lo si dice.
    const anniFissi = typeof c.anniFissi === 'number' ? c.anniFissi : null;
    const offertaFissa = typeof c.offertaFissa === 'number' ? c.offertaFissa : null;
    const lancioFinale: LancioPiano | null = esito.lancio
      ? { ...esito.lancio }
      : anniFissi !== null || offertaFissa !== null
        ? { ...LANCIO_PIANO_PREDEFINITO }
        : null;
    let anniTroncati = false;
    const minAnni = c.minAnni ?? 0;
    if (lancioFinale) {
      // L'impostazione e la procedura sono dell'operatore (o dello scenario):
      // l'analisi può proporre numeri, non cambiarne il quadro.
      if (c.impostazione && ['PRUDENTE', 'NEUTRA', 'FAVOREVOLE'].includes(c.impostazione))
        lancioFinale.prudenza = c.impostazione as LancioPiano['prudenza'];
      if (c.procedura && ['ACCORDO', 'LIQUIDAZIONE', 'CRAM_DOWN'].includes(c.procedura))
        lancioFinale.procedura = c.procedura as LancioPiano['procedura'];
      // Gli anni e l'offerta del lancio sono quelli scritti dall'operatore.
      if (offertaFissa !== null) lancioFinale.percentualeOfferta = offertaFissa;
      if (anniFissi !== null) lancioFinale.anniRientro = anniFissi;
      // Il piano non si restituisce in meno anni dell'arco scelto.
      else if (minAnni > 0)
        lancioFinale.anniRientro = Math.max(minAnni, lancioFinale.anniRientro ?? minAnni);
      if (lancioFinale.anniRientro && lancioFinale.anniRientro > c.orizzonte) {
        lancioFinale.anniRientro = c.orizzonte;
        anniTroncati = true;
      }
    }
    const nota = [
      `Ipotesi impostate dall’AI il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}; i risultati li calcola il motore della piattaforma.`,
      `Le leve scelte dall’analisi sono applicate al calcolo dalla piattaforma: le percentuali delle righe sono il percorso senza il loro effetto.`,
      anniTroncati
        ? `La restituzione del debito resta entro i ${c.orizzonte} anni del piano: gli anni chiesti nel lancio non potevano essere più lunghi dell'orizzonte.`
        : '',
      esito.sintesi ? `${PREFISSO_SINTESI_NOTA}${esito.sintesi}` : '',
      notaRicerca(ricerca),
      propostaScartata,
      esito.scartati.length
        ? `Valori scartati perché fuori dagli intervalli ammessi: ${esito.scartati.join('; ')}.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    // LA VARIANTE PRECEDENTE SI METTE DA PARTE (0.256.41). Prima una nuova
    // elaborazione riscriveva «elaborazione-ai» e il piano di prima spariva.
    // Ora quella riga prende un nome suo e resta tra le varianti, confrontabile;
    // l'archiviazione è qui, dopo la risposta del modello, così un'elaborazione
    // fallita non tocca il piano che c'era.
    const nomiVarianti = await pool.query(
      `SELECT variante FROM "${s}".piano_sviluppo WHERE scenario_id = $1`,
      [scenarioId]
    );
    const variantiEsistenti = nomiVarianti.rows.map((r) => String(r.variante));
    if (variantiEsistenti.includes(VARIANTE_AI)) {
      // Il nome archivio manca solo se i nomi ammessi sono tutti presi: in quel
      // caso meglio fermarsi che sovrascrivere un piano già messo da parte.
      const archivio = nomeArchivioElaborazione(variantiEsistenti);
      if (!archivio)
        return {
          success: false,
          error:
            'Ci sono già tutte le varianti messe da parte che il nome consente: eliminane qualcuna e riprova.',
        };
      // Qui la variante non è il progetto (il controllo è più sopra): non serve
      // ripeterlo nella condizione dell'UPDATE.
      await pool.query(
        `UPDATE "${s}".piano_sviluppo SET variante = $3 WHERE scenario_id = $1 AND variante = $2`,
        [scenarioId, VARIANTE_AI, archivio]
      );
    }
    await pool.query(
      `INSERT INTO "${s}".piano_sviluppo (scenario_id, variante, orizzonte, ipotesi, note, rettifiche, leve, lancio, ricerca, salvato_il)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (scenario_id, variante) DO UPDATE SET orizzonte = $3, ipotesi = $4, note = $5, rettifiche = $6,
         leve = $7, lancio = COALESCE($8, piano_sviluppo.lancio), ricerca = $9, salvato_il = now()`,
      [
        scenarioId,
        VARIANTE_AI,
        c.orizzonte,
        JSON.stringify(esito.ipotesi),
        nota,
        rettifiche ? JSON.stringify(rettifiche) : null,
        JSON.stringify(levePiano),
        lancioFinale ? JSON.stringify(lancioFinale) : null,
        JSON.stringify(ricercaSalvata),
      ]
    );
    return {
      success: true,
      ipotesi: esito.ipotesi,
      sintesi: esito.sintesi,
      scartati: esito.scartati,
      ricerca: ricercaSalvata,
    };
  } catch (error: unknown) {
    console.error('[elaboraPianoConAiAction]', error);
    // Chiave revocata, credito esaurito, rete assente: il pannello legge il
    // messaggio in italiano come per le altre funzioni AI, non l'errore grezzo
    // del fornitore (0.256.47).
    return {
      success: false,
      error:
        erroreServizioEsterno(error, 'AI') ??
        `Elaborazione con l’AI non riuscita: ${(error as Error).message || error}`,
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
