'use server';

// Brogliaccio — solo per gli scenari RICEVUTA. Si veda il commento in
// db/provision.ts (assicuraTabellaBrogliaccio) per la logica a 3
// livelli. Ogni "genera" raccoglie dati già presenti altrove in
// piattaforma e li scrive in un testo — nessun dato nuovo, solo
// aggregazione.

import { richiediAccessoScenario } from '@/lib/autorizzazione';
import { pool } from '@/lib/db';
import { assicuraTabellaBrogliaccio } from '@/db/provision';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import {
  ottieniPropostaScenario,
  verificaRicevibilitaProposta,
} from '@/app/actions/propostaScenario';
import { ottieniAnagraficaEnte } from '@/app/actions/anagraficaEnte';
import { ottieniEtichetteAnagraficaEnte } from '@/app/actions/anagraficaEnteConfig';
import { ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { ottieniEtichetteTipoDebito } from '@/app/actions/tipoDebitoConfig';
import { raggruppaPerTipoDebito } from '@/lib/debitiEnte/tipoDebito';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniScreeningAzienda } from '@/app/actions/screeningAzienda';
import { ottienePosizioneAggiornata } from '@/app/actions/posizioneAggiornata';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { ottieniAnalisiRiceventeAction } from '@/app/actions/simulazioneRicevente';
import { generaConfrontoLiquidatorioSeNecessarioAction } from '@/app/actions/confrontoLiquidatorio';
import { crescitaAzienda, crescitaDaSerie } from '@/lib/piano/automatico';
import { sintesiPianoScenarioAction } from '@/app/actions/sintesiPiano';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

async function ottieniTipoSpazio(nomeSchema: string): Promise<'ENTE' | 'NON_ENTE'> {
  const r = await pool.query(`SELECT tipo_spazio FROM public.spazi WHERE nome_schema = $1`, [
    nomeSchema,
  ]);
  return r.rows[0]?.tipo_spazio || 'NON_ENTE';
}

export interface StatoBrogliaccio {
  livello1Testo: string | null;
  livello1GeneratoIl: string | null;
  livello2Richiesto: boolean;
  livello2Testo: string | null;
  livello2GeneratoIl: string | null;
  livello3Richiesto: boolean;
  livello3Testo: string | null;
  livello3GeneratoIl: string | null;
}

const STATO_VUOTO: StatoBrogliaccio = {
  livello1Testo: null,
  livello1GeneratoIl: null,
  livello2Richiesto: false,
  livello2Testo: null,
  livello2GeneratoIl: null,
  livello3Richiesto: false,
  livello3Testo: null,
  livello3GeneratoIl: null,
};

export interface RisultatoBrogliaccio {
  success: boolean;
  stato: StatoBrogliaccio;
  error?: string;
}

function mappaStato(r: Record<string, unknown>): StatoBrogliaccio {
  return {
    livello1Testo: (r.livello1_testo as string) || null,
    livello1GeneratoIl: (r.livello1_generato_il as string) || null,
    livello2Richiesto: !!r.livello2_richiesto,
    livello2Testo: (r.livello2_testo as string) || null,
    livello2GeneratoIl: (r.livello2_generato_il as string) || null,
    livello3Richiesto: !!r.livello3_richiesto,
    livello3Testo: (r.livello3_testo as string) || null,
    livello3GeneratoIl: (r.livello3_generato_il as string) || null,
  };
}

export async function ottieniBrogliaccio(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoBrogliaccio> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!validaSchema(nomeSchema)) {
      return { success: false, stato: STATO_VUOTO, error: 'Nome schema non valido.' };
    }
    await assicuraTabellaBrogliaccio(nomeSchema);
    const r = await pool.query(`SELECT * FROM "${nomeSchema}".brogliaccio WHERE scenario_id = $1`, [
      scenarioId,
    ]);
    if (r.rows.length === 0) return { success: true, stato: STATO_VUOTO };
    return { success: true, stato: mappaStato(r.rows[0]) };
  } catch (error: any) {
    console.error('[ottieniBrogliaccio] Errore:', error);
    return {
      success: false,
      stato: STATO_VUOTO,
      error: `Impossibile caricare: ${error.message || error}`,
    };
  }
}

// ============================================================================
// LIVELLO 1 — Posizione Ente + Proposta. Sempre generabile, primo giudizio.
// ============================================================================

// I livelli del Brogliaccio del Ricevente (generazione, varchi) sono stati
// eliminati con la 0.122: l'istruttoria della proposta ricevuta è una pagina
// sola e il documento da consegnare è la Relazione. Restano lettura e tipi,
// usati dal Brogliaccio del Redigente e dai documenti di corredo.
