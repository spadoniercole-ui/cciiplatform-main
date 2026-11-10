'use server';

// IL RAMO CONTABILE PER ANNO — azioni.
//
// Dal bilancio XBRL depositato si apre il ramo di partenza di quell'anno; sul
// ramo si innestano le simulazioni, che applicano ipotesi dichiarate e
// ricostruiscono dati e indici con l'unico motore esistente
// (costruisciBundleIndici). I rami restano accanto: gli anni non si
// sovrascrivono e una simulazione non cancella il bilancio da cui parte.
//
// Nessun calcolo qui: le funzioni pure stanno in src/lib/contabile/rami.ts,
// questa azione legge, autorizza e persiste.

import { pool } from '@/lib/db';
import {
  richiediAccessoSchema,
  richiediAccessoScenario,
  verificaRigaConsentita,
} from '@/lib/autorizzazione';
import { assicuraTabellaContabileRami } from '@/db/provision';
import { costruisciBundleIndici } from '@/lib/xbrl/indici';
import {
  applicaLeve,
  confrontoVoci,
  descrizioneLeve,
  normalizzaLeve,
  valutaRamo,
  type LeveSimulazione,
  type ValutazioneRamo,
  type VoceConfronto,
} from '@/lib/contabile/rami';
import { ottieniScenarioPerId, verificaScenarioNonBloccato } from '@/app/actions/scenari';
import { leggiDebitoEnteMemorizzato } from '@/lib/debitiEnte/memorizzaDebitoEnte';
import type {
  AlertSeverity,
  DatiFinanziariPeriodo,
  IndiceCcii,
  SituazioneDebitoria,
} from '@/lib/xbrl/types';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

function oggetto<T>(valore: unknown, difetto: T): T {
  if (valore && typeof valore === 'object') return valore as T;
  if (typeof valore === 'string') {
    try {
      const letto = JSON.parse(valore);
      if (letto && typeof letto === 'object') return letto as T;
    } catch {
      // JSON non leggibile: si usa il difetto, senza inventare dati.
    }
  }
  return difetto;
}

export interface RamoContabile {
  id: number;
  scenarioId: number;
  anno: number;
  etichetta: string;
  tipo: 'PARTENZA' | 'SIMULAZIONE';
  baseId: number | null;
  xbrlId: number | null;
  dati: DatiFinanziariPeriodo;
  leve: LeveSimulazione;
  indici: IndiceCcii[];
  altriIndici: IndiceCcii[];
  situazioneDebitoria: SituazioneDebitoria;
  severity: AlertSeverity;
  valutazione: ValutazioneRamo | null;
  createdAt: string;
  /** Solo per le simulazioni: il raffronto con il ramo di partenza. */
  confronto?: VoceConfronto[];
}

export interface AnnoDisponibile {
  anno: number;
  nomeFile: string | null;
  ramiAperti: number;
}

/**
 * Il debito consegnato dalla verifica amministrativa: è la quota che la
 * simulazione porta nel passivo come ipotesi di partenza, dichiarata.
 */
export interface DebitoSorgente {
  totale: number;
  memorizzatoIl: string | null;
  fonte: string;
  natura: 'previdenziale' | 'tributario';
}

export interface RisultatoRamiContabile {
  success: boolean;
  anni: AnnoDisponibile[];
  rami: RamoContabile[];
  debitoSorgente: DebitoSorgente | null;
  error?: string;
}

export interface RisultatoOperazioneRamo {
  success: boolean;
  ramo?: RamoContabile;
  confronto?: VoceConfronto[];
  error?: string;
}

function rigaARamo(r: any): RamoContabile {
  return {
    id: Number(r.id),
    scenarioId: Number(r.scenario_id),
    anno: Number(r.anno_bilancio),
    etichetta: String(r.etichetta ?? ''),
    tipo: r.tipo === 'SIMULAZIONE' ? 'SIMULAZIONE' : 'PARTENZA',
    baseId: r.ramo_base_id === null || r.ramo_base_id === undefined ? null : Number(r.ramo_base_id),
    xbrlId:
      r.xbrl_storico_id === null || r.xbrl_storico_id === undefined
        ? null
        : Number(r.xbrl_storico_id),
    dati: oggetto<DatiFinanziariPeriodo>(r.dati_finanziari, {} as DatiFinanziariPeriodo),
    leve: normalizzaLeve(oggetto<LeveSimulazione>(r.leve, normalizzaLeve(null))),
    indici: oggetto<IndiceCcii[]>(r.indici, []),
    altriIndici: oggetto<IndiceCcii[]>(r.altri_indici, []),
    situazioneDebitoria: oggetto<SituazioneDebitoria>(r.situazione_debitoria, {
      debitiBanche: 0,
      debitiFornitori: 0,
      debitiTributari: 0,
      debitiPrevidenziali: 0,
      altriDebiti: 0,
      totaleDebiti: 0,
      disponibilitaLiquide: 0,
      pfn: 0,
    }),
    severity: (r.severity ?? 'YELLOW') as AlertSeverity,
    valutazione: r.valutazione ? oggetto<ValutazioneRamo>(r.valutazione, null as never) : null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
  };
}

/**
 * I rami aperti sullo scenario e gli anni XBRL disponibili sull'azienda: da
 * qui si vede quali anni hanno già il ramo di partenza e quali aspettano.
 */
export async function elencoRamiContabileAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoRamiContabile> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!validaSchema(nomeSchema)) {
      return {
        success: false,
        anni: [],
        rami: [],
        debitoSorgente: null,
        error: 'Nome schema non valido.',
      };
    }
    await assicuraTabellaContabileRami(nomeSchema);

    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return {
        success: false,
        anni: [],
        rami: [],
        debitoSorgente: null,
        error: scenarioRis.error || 'Scenario non trovato.',
      };
    }
    const aziendaId = scenarioRis.scenario.aziendaId;

    // Il debito memorizzato a verifica amministrativa chiusa. Se c'è, la
    // simulazione parte da quella cifra; se non c'è, il campo resta vuoto e
    // l'operatore decide.
    const memorizzato = await leggiDebitoEnteMemorizzato(nomeSchema, aziendaId);
    const debitoSorgente: DebitoSorgente | null = memorizzato
      ? {
          totale: memorizzato.debito.totale,
          memorizzatoIl: memorizzato.memorizzatoIl,
          fonte: memorizzato.debito.fonte,
          natura:
            memorizzato.debito.contributi >= memorizzato.debito.sanzioni
              ? 'previdenziale'
              : 'tributario',
        }
      : null;

    const [ramiRis, anniRis] = await Promise.all([
      pool.query(
        `SELECT * FROM "${nomeSchema}".contabile_rami
          WHERE scenario_id = $1
          ORDER BY anno_bilancio DESC, (tipo = 'PARTENZA') DESC, id ASC`,
        [scenarioId]
      ),
      pool.query(
        `SELECT anno_bilancio, nome_file FROM "${nomeSchema}".xbrl_storico_azienda
          WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL
          ORDER BY anno_bilancio DESC`,
        [aziendaId]
      ),
    ]);

    const rami = ramiRis.rows.map(rigaARamo);
    for (const ramo of rami) {
      if (ramo.tipo !== 'SIMULAZIONE' || ramo.baseId === null) continue;
      const base = rami.find((r) => r.id === ramo.baseId);
      if (base) ramo.confronto = confrontoVoci(base.dati, ramo.dati);
    }

    const anni: AnnoDisponibile[] = anniRis.rows.map((r) => {
      const anno = Number(r.anno_bilancio);
      return {
        anno,
        nomeFile: r.nome_file ? String(r.nome_file) : null,
        ramiAperti: rami.filter((x) => x.anno === anno && x.tipo === 'PARTENZA').length,
      };
    });

    return { success: true, anni, rami, debitoSorgente };
  } catch (error: any) {
    console.error('[elencoRamiContabileAction] Errore:', error);
    return {
      success: false,
      anni: [],
      rami: [],
      debitoSorgente: null,
      error: `Impossibile leggere i rami contabili: ${error.message || error}`,
    };
  }
}

/**
 * Apre il ramo di partenza di un anno dal bilancio XBRL depositato. Il ramo
 * non sostituisce gli altri anni: si aggiunge. Se per quell'anno il bilancio
 * non c'è, il ramo non si apre — la contabile non si inventa.
 */
export async function creaRamoContabileAction(
  nomeSchema: string,
  scenarioId: number,
  anno: number
): Promise<RisultatoOperazioneRamo> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['xbrl'],
      livello: 'SCRITTURA',
    });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) {
      return { success: false, error: 'Anno del bilancio non valido.' };
    }

    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { success: false, error: scenarioRis.error || 'Scenario non trovato.' };
    }
    const aziendaId = scenarioRis.scenario.aziendaId;

    await assicuraTabellaContabileRami(nomeSchema);

    const bilancioRis = await pool.query(
      `SELECT id, dati_finanziari, nome_file FROM "${nomeSchema}".xbrl_storico_azienda
        WHERE azienda_id = $1 AND anno_bilancio = $2 LIMIT 1`,
      [aziendaId, anno]
    );
    const bilancio = bilancioRis.rows[0];
    if (!bilancio) {
      return {
        success: false,
        error: `Nessun bilancio XBRL per l’anno ${anno}: caricalo prima di aprire il ramo contabile.`,
      };
    }

    const esistenteRis = await pool.query(
      `SELECT id FROM "${nomeSchema}".contabile_rami
        WHERE scenario_id = $1 AND anno_bilancio = $2 AND tipo = 'PARTENZA' LIMIT 1`,
      [scenarioId, anno]
    );
    if (esistenteRis.rows.length > 0) {
      return {
        success: false,
        error: `Il ramo contabile ${anno} è già aperto su questo scenario.`,
      };
    }

    const dati = oggetto<DatiFinanziariPeriodo>(bilancio.dati_finanziari, null as never);
    if (!dati || typeof dati.ricaviVendite !== 'number') {
      return {
        success: false,
        error: `Il bilancio ${anno} è archiviato senza dati finanziari leggibili: ricaricalo da Analisi Bilancio.`,
      };
    }

    const bundle = costruisciBundleIndici(dati);
    const inserita = await pool.query(
      `INSERT INTO "${nomeSchema}".contabile_rami
         (scenario_id, azienda_id, anno_bilancio, etichetta, tipo, xbrl_storico_id,
          dati_finanziari, leve, indici, altri_indici, situazione_debitoria, severity)
       VALUES ($1, $2, $3, $4, 'PARTENZA', $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        scenarioId,
        aziendaId,
        anno,
        `Bilancio ${anno}`,
        Number(bilancio.id),
        JSON.stringify(dati),
        JSON.stringify(normalizzaLeve(null)),
        JSON.stringify(bundle.indici),
        JSON.stringify(bundle.altriIndici),
        JSON.stringify(bundle.situazioneDebitoria),
        bundle.severity,
      ]
    );

    return { success: true, ramo: rigaARamo(inserita.rows[0]) };
  } catch (error: any) {
    console.error('[creaRamoContabileAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aprire il ramo contabile: ${error.message || error}`,
    };
  }
}

/**
 * Crea una simulazione su un ramo di partenza: le leve si applicano ai dati
 * del ramo (non a quelli dell'azienda, che restano intatti), gli indici si
 * ricalcolano con lo stesso motore e la valutazione si conserva con il ramo.
 * Ogni simulazione è un ramo a sé: non si sovrascrive la precedente.
 */
export async function simulaRamoContabileAction(
  nomeSchema: string,
  scenarioId: number,
  ramoBaseId: number,
  leve: Partial<LeveSimulazione>
): Promise<RisultatoOperazioneRamo> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['xbrl'],
      livello: 'SCRITTURA',
    });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    await assicuraTabellaContabileRami(nomeSchema);

    const baseRis = await pool.query(
      `SELECT * FROM "${nomeSchema}".contabile_rami
        WHERE id = $1 AND scenario_id = $2 AND tipo = 'PARTENZA' LIMIT 1`,
      [ramoBaseId, scenarioId]
    );
    const base = baseRis.rows[0];
    if (!base) {
      return { success: false, error: 'Ramo di partenza non trovato su questo scenario.' };
    }

    const leveNormalizzate = normalizzaLeve(leve);
    const datiBase = oggetto<DatiFinanziariPeriodo>(base.dati_finanziari, null as never);
    const datiSimulati = applicaLeve(datiBase, leveNormalizzate);
    const bundle = costruisciBundleIndici(datiSimulati);
    const valutazione = valutaRamo(datiSimulati, bundle.indici);

    const inserita = await pool.query(
      `INSERT INTO "${nomeSchema}".contabile_rami
         (scenario_id, azienda_id, anno_bilancio, etichetta, tipo, ramo_base_id, xbrl_storico_id,
          dati_finanziari, leve, indici, altri_indici, situazione_debitoria, severity, valutazione)
       VALUES ($1, $2, $3, $4, 'SIMULAZIONE', $5, NULL, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        scenarioId,
        Number(base.azienda_id),
        Number(base.anno_bilancio),
        `Simulazione ${Number(base.anno_bilancio)} · ${descrizioneLeve(leveNormalizzate)}`,
        ramoBaseId,
        JSON.stringify(datiSimulati),
        JSON.stringify(leveNormalizzate),
        JSON.stringify(bundle.indici),
        JSON.stringify(bundle.altriIndici),
        JSON.stringify(bundle.situazioneDebitoria),
        bundle.severity,
        JSON.stringify(valutazione),
      ]
    );

    return {
      success: true,
      ramo: rigaARamo(inserita.rows[0]),
      confronto: confrontoVoci(datiBase, datiSimulati),
    };
  } catch (error: any) {
    console.error('[simulaRamoContabileAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile lanciare la simulazione: ${error.message || error}`,
    };
  }
}

export async function eliminaRamoContabileAction(
  nomeSchema: string,
  ramoId: number
): Promise<RisultatoOperazioneRamo> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, {
      modulo: ['xbrl'],
      livello: 'SCRITTURA',
    });
    await verificaRigaConsentita(contesto, 'contabile_rami', ramoId);
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };

    const rigaRis = await pool.query(
      `SELECT scenario_id FROM "${nomeSchema}".contabile_rami WHERE id = $1`,
      [ramoId]
    );
    if (rigaRis.rows.length === 0) return { success: false, error: 'Ramo non trovato.' };
    const messaggioBloccato = await verificaScenarioNonBloccato(
      nomeSchema,
      Number(rigaRis.rows[0].scenario_id)
    );
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };

    await pool.query(`DELETE FROM "${nomeSchema}".contabile_rami WHERE id = $1`, [ramoId]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaRamoContabileAction] Errore:', error);
    return { success: false, error: `Impossibile eliminare il ramo: ${error.message || error}` };
  }
}
