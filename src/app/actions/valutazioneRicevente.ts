'use server';

// Lista di controllo prima dell'avvio della valutazione (percorso
// Ricevente). Raccoglie lo stato che non dipende dai file scelti nel
// browser: posizioni aggiornate caricate, freschezza dei dati ISTAT di
// settore, flag dell'analisi del piano sullo scenario, dichiarazioni
// «non pervenuto» dell'istruttore. Il calcolo della lista è in
// lib/valutazione/listaControllo.ts, puro e collaudato.

import { pool } from '@/lib/db';
import { assicuraTabellaSimulazioneRicevente } from '@/db/provision';
import { ottieniScenarioPerId, verificaScenarioNonBloccato } from '@/app/actions/scenari';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';
import { ottieniTuttePosizioniAggiornate } from '@/app/actions/posizioneAggiornata';

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
  };
  if (!validaSchema(nomeSchema)) return { ...vuoto, error: 'Nome schema non valido.' };
  try {
    await assicuraTabellaSimulazioneRicevente(nomeSchema);
    const [plusRis, scenarioRis, settoreRis, posizioniRis, dichRis] = await Promise.all([
      ottieniFunzioniPlusSpazio(nomeSchema),
      ottieniScenarioPerId(nomeSchema, scenarioId),
      ottieniDatiSettore(nomeSchema, aziendaId),
      ottieniTuttePosizioniAggiornate(nomeSchema, scenarioId),
      pool.query(
        `SELECT dichiarazioni FROM "${nomeSchema}".simulazione_ricevente WHERE scenario_id = $1`,
        [scenarioId]
      ),
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
    return {
      success: true,
      posizioniAggiornate: posizioniRis.success ? posizioniRis.posizioni.length : 0,
      settore,
      pianoSviluppoAttivo: Boolean(scenarioRis.success && scenarioRis.scenario?.simulazioneAttiva),
      dichiarazioni: (dichRis.rows[0]?.dichiarazioni as DichiarazioniValutazione) || {},
    };
  } catch (error: any) {
    console.error('[ottieniStatoValutazioneAction] Errore:', error);
    return {
      ...vuoto,
      error: `Impossibile leggere lo stato della valutazione: ${error.message || error}`,
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
