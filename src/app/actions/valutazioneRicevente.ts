'use server';

// Lista di controllo prima dell'avvio della valutazione (percorso
// Ricevente). Raccoglie lo stato che non dipende dai file scelti nel
// browser: posizioni aggiornate caricate, freschezza dei dati ISTAT di
// settore, flag dell'analisi del piano sullo scenario, dichiarazioni
// «non pervenuto» dell'istruttore. Il calcolo della lista è in
// lib/valutazione/listaControllo.ts, puro e collaudato.

import { richiediAccessoScenario } from '@/lib/autorizzazione';
import { pool } from '@/lib/db';
import { assicuraTabellaSimulazioneRicevente } from '@/db/provision';
import { ottieniScenarioPerId, verificaScenarioNonBloccato } from '@/app/actions/scenari';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';
import { ottieniTuttePosizioniAggiornate } from '@/app/actions/posizioneAggiornata';
import {
  sceltePianoPulite,
  type PianoDisponibile,
  type SceltePianoValutazione,
} from '@/lib/piano/scelteValutazione';

export interface DichiarazioniValutazione {
  asseverazioneNonPervenuta?: boolean;
  pianoAziendaleNonPervenuto?: boolean;
  posizioneNonPervenuta?: boolean;
}

export interface StatoValutazione {
  success: boolean;
  error?: string;
  posizioniAggiornate: number;
  settore:
    { applicabile: false; motivo: string } | { applicabile: true; aggiornatoIl: string | null };
  pianoSviluppoAttivo: boolean;
  dichiarazioni: DichiarazioniValutazione;
  /** Piani che si possono scegliere prima della valutazione. */
  piani: PianoDisponibile[];
  /** Scelte già salvate, se l'istruttore le ha fatte. */
  opzioniPiano: SceltePianoValutazione | null;
}

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

function isoOppureNull(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function ottieniStatoValutazioneAction(
  nomeSchema: string,
  scenarioId: number,
  aziendaId: number
): Promise<StatoValutazione> {
  const vuoto: StatoValutazione = {
    success: false,
    posizioniAggiornate: 0,
    settore: { applicabile: false, motivo: '' },
    pianoSviluppoAttivo: false,
    dichiarazioni: {},
    piani: [],
    opzioniPiano: null,
  };
  if (!validaSchema(nomeSchema)) return { ...vuoto, error: 'Nome schema non valido.' };
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    await assicuraTabellaSimulazioneRicevente(nomeSchema);
    const [plusRis, scenarioRis, settoreRis, posizioniRis, dichRis, pianiRis] = await Promise.all([
      ottieniFunzioniPlusSpazio(nomeSchema),
      ottieniScenarioPerId(nomeSchema, scenarioId),
      ottieniDatiSettore(nomeSchema, aziendaId),
      ottieniTuttePosizioniAggiornate(nomeSchema, scenarioId),
      pool.query(
        `SELECT dichiarazioni, opzioni_piano FROM "${nomeSchema}".simulazione_ricevente WHERE scenario_id = $1`,
        [scenarioId]
      ),
      pool
        .query(
          `SELECT DISTINCT variante FROM "${nomeSchema}".piano_sviluppo WHERE scenario_id = $1 ORDER BY variante`,
          [scenarioId]
        )
        .catch(() => ({ rows: [] as { variante: string }[] })),
    ]);
    // Settore «non applicabile» solo quando manca la copertura ISTAT o il
    // codice ATECO: in quel caso non si può pretendere l'aggiornamento, ma
    // lo si dice. Un errore tecnico di lettura resta un errore visibile.
    const settore: StatoValutazione['settore'] = !plusRis.funzioni.datiSettore
      ? {
          applicabile: false,
          motivo: 'Dati di Settore non inclusi nella licenza di questo spazio.',
        }
      : settoreRis.success
        ? { applicabile: true, aggiornatoIl: isoOppureNull(settoreRis.aggiornatoIl) }
        : { applicabile: false, motivo: settoreRis.error || 'Dati di settore non disponibili.' };
    const varianti = pianiRis.rows.map((r) => String(r.variante)).filter(Boolean);
    const azienda = await pool
      .query(`SELECT 1 FROM "${nomeSchema}".piano_aziendale WHERE scenario_id = $1 LIMIT 1`, [
        scenarioId,
      ])
      .catch(() => ({ rowCount: 0 }));
    const piani: PianoDisponibile[] = [];
    if ((azienda.rowCount ?? 0) > 0) {
      piani.push({ chiave: 'azienda', nome: 'Piano dell’azienda', tipo: 'azienda' });
    }
    for (const v of varianti) {
      piani.push({
        chiave: v,
        nome:
          v === 'base'
            ? 'Piano base della piattaforma'
            : v === 'elaborazione-ai'
              ? 'Piano elaborato dall’AI'
              : `Variante «${v}»`,
        tipo: v === 'base' ? 'base' : v === 'elaborazione-ai' ? 'ai' : 'variante',
      });
    }
    return {
      success: true,
      posizioniAggiornate: posizioniRis.success ? posizioniRis.posizioni.length : 0,
      settore,
      pianoSviluppoAttivo: Boolean(scenarioRis.success && scenarioRis.scenario?.simulazioneAttiva),
      dichiarazioni: (dichRis.rows[0]?.dichiarazioni as DichiarazioniValutazione) || {},
      piani,
      opzioniPiano: sceltePianoPulite(dichRis.rows[0]?.opzioni_piano),
    };
  } catch (error: any) {
    console.error('[ottieniStatoValutazioneAction] Errore:', error);
    return {
      ...vuoto,
      error: `Impossibile leggere lo stato della valutazione: ${error.message || error}`,
    };
  }
}

export async function salvaSceltePianoValutazioneAction(
  nomeSchema: string,
  scenarioId: number,
  scelte: SceltePianoValutazione
): Promise<{ success: boolean; error?: string }> {
  if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['report'],
      livello: 'SCRITTURA',
    });
    const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    await assicuraTabellaSimulazioneRicevente(nomeSchema);
    const pulite = sceltePianoPulite(scelte) ?? {
      includiPianoAziendale: true,
      pianoScelto: 'base',
      includiConfronto: true,
      pianiConfronto: [],
    };
    await pool.query(
      `INSERT INTO "${nomeSchema}".simulazione_ricevente (scenario_id, opzioni_piano)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (scenario_id) DO UPDATE SET opzioni_piano = EXCLUDED.opzioni_piano`,
      [scenarioId, JSON.stringify(pulite)]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[salvaSceltePianoValutazioneAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare le scelte sul piano: ${error.message || error}`,
    };
  }
}

export async function salvaDichiarazioniValutazioneAction(
  nomeSchema: string,
  scenarioId: number,
  dichiarazioni: DichiarazioniValutazione
): Promise<{ success: boolean; error?: string }> {
  if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['report'],
      livello: 'SCRITTURA',
    });
    const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    await assicuraTabellaSimulazioneRicevente(nomeSchema);
    const pulite: DichiarazioniValutazione = {
      asseverazioneNonPervenuta: Boolean(dichiarazioni.asseverazioneNonPervenuta),
      pianoAziendaleNonPervenuto: Boolean(dichiarazioni.pianoAziendaleNonPervenuto),
      posizioneNonPervenuta: Boolean(dichiarazioni.posizioneNonPervenuta),
    };
    await pool.query(
      `INSERT INTO "${nomeSchema}".simulazione_ricevente (scenario_id, dichiarazioni)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (scenario_id) DO UPDATE SET dichiarazioni = EXCLUDED.dichiarazioni`,
      [scenarioId, JSON.stringify(pulite)]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[salvaDichiarazioniValutazioneAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}
