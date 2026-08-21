'use server';

// Presa in carico dello step "Analisi Bilancio" a livello di azienda.
//
// Il passo diventa verde quando l'operatore ha aperto ENTRAMBE le
// sotto-sezioni — Configurazione XBRL e Indici — che sono solo un
// sottoinsieme dei parametri di spazio (nessun caricamento pesante qui: il
// bilancio XBRL vero si carica nello Scenario). Registriamo la visita una
// riga per azienda, due booleani. La visita è idempotente: se la sezione
// era già segnata, non cambia nulla e non forziamo un refresh inutile del
// semaforo (per quello serve il flag `cambiato`).

import { pool } from '@/lib/db';
import { assicuraTabellaAnalisiBilancioStep } from '@/db/provision';

export type SezioneAnalisiBilancio = 'xbrl' | 'indici';

export interface StatoAnalisiBilancioStep {
  xbrlConfigVista: boolean;
  indiciVisti: boolean;
}

const STATO_VUOTO: StatoAnalisiBilancioStep = {
  xbrlConfigVista: false,
  indiciVisti: false,
};

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

// Whitelist: la colonna non viene mai dall'input utente ma da questa mappa
// fissa, quindi è sicuro interpolarla nel testo SQL.
const COLONNA_PER_SEZIONE: Record<SezioneAnalisiBilancio, string> = {
  xbrl: 'xbrl_config_vista',
  indici: 'indici_visti',
};

export interface RisultatoStatoAnalisiBilancio {
  success: boolean;
  stato: StatoAnalisiBilancioStep;
  error?: string;
}

export async function ottieniStatoAnalisiBilancioStep(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoStatoAnalisiBilancio> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, stato: STATO_VUOTO, error: 'Nome schema non valido.' };
    }
    await assicuraTabellaAnalisiBilancioStep(nomeSchema);
    const risultato = await pool.query(
      `SELECT xbrl_config_vista, indici_visti FROM "${nomeSchema}".analisi_bilancio_step WHERE azienda_id = $1`,
      [aziendaId]
    );
    if (risultato.rows.length === 0) {
      return { success: true, stato: STATO_VUOTO };
    }
    const r = risultato.rows[0];
    return {
      success: true,
      stato: {
        xbrlConfigVista: r.xbrl_config_vista === true,
        indiciVisti: r.indici_visti === true,
      },
    };
  } catch (error: any) {
    console.error('[ottieniStatoAnalisiBilancioStep] Errore:', error);
    return {
      success: false,
      stato: STATO_VUOTO,
      error: `Impossibile leggere lo stato dell'analisi bilancio: ${error.message || error}`,
    };
  }
}

export interface RisultatoVistaAnalisiBilancio {
  success: boolean;
  /** true solo se questa chiamata ha effettivamente segnato la sezione come vista per la prima volta (serve al client per decidere se chiamare router.refresh). */
  cambiato: boolean;
  error?: string;
}

export async function segnaVistaAnalisiBilancioAction(
  nomeSchema: string,
  aziendaId: number,
  sezione: SezioneAnalisiBilancio
): Promise<RisultatoVistaAnalisiBilancio> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, cambiato: false, error: 'Nome schema non valido.' };
    }
    const colonna = COLONNA_PER_SEZIONE[sezione];
    if (!colonna) {
      return { success: false, cambiato: false, error: 'Sezione non valida.' };
    }
    await assicuraTabellaAnalisiBilancioStep(nomeSchema);

    // Se la sezione è già segnata, non tocchiamo nulla: niente scrittura,
    // niente refresh del semaforo.
    const attuale = await pool.query(
      `SELECT ${colonna} AS vista FROM "${nomeSchema}".analisi_bilancio_step WHERE azienda_id = $1`,
      [aziendaId]
    );
    if (attuale.rows.length > 0 && attuale.rows[0].vista === true) {
      return { success: true, cambiato: false };
    }

    await pool.query(
      `INSERT INTO "${nomeSchema}".analisi_bilancio_step (azienda_id, ${colonna}, updated_at)
       VALUES ($1, TRUE, now())
       ON CONFLICT (azienda_id) DO UPDATE SET ${colonna} = TRUE, updated_at = now()`,
      [aziendaId]
    );
    return { success: true, cambiato: true };
  } catch (error: any) {
    console.error('[segnaVistaAnalisiBilancioAction] Errore:', error);
    return {
      success: false,
      cambiato: false,
      error: `Impossibile registrare la presa visione: ${error.message || error}`,
    };
  }
}
