'use server';

import { pool } from '@/lib/db';
import { assicuraTabellaLicenze } from '@/db/ensureTables';
import { generaSlug } from '@/lib/slug';

export type StatoLicenza = 'ATTIVA' | 'SOSPESA' | 'CESSATA';

export interface Licenza {
  id_licenza: string;
  ragione_sociale: string;
  codice_fiscale: string | null;
  partita_iva: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  pec: string | null;
  max_spazi: number;
  max_aziende: number;
  max_utenti: number;
  data_attivazione: Date;
  data_scadenza: string | null;
  stato_disattiva: boolean;
  stato: StatoLicenza;
  data_sospensione: Date | null;
  data_cessazione: Date | null;
  motivo_stato: string | null;
  plus_dati_settore: boolean;
  plus_simulazione: boolean;
  plus_relazione_ai: boolean;
}

/**
 * Genera una chiave di licenza "parlante": incorpora la ragione sociale, non
 * solo caratteri casuali, così è riconoscibile a colpo d'occhio invece che
 * un codice opaco da dover sempre ricercare per capire a chi appartiene.
 * Formato: CCII-{SLUG-RAGIONE-SOCIALE}-XXXX
 */
function generaChiaveLicenza(ragioneSociale: string): string {
  const caratteri = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const slug = generaSlug(ragioneSociale, 12);
  let suffisso = '';
  for (let i = 0; i < 4; i++) {
    suffisso += caratteri.charAt(Math.floor(Math.random() * caratteri.length));
  }
  return `CCII-${slug}-${suffisso}`;
}

/**
 * Elenca tutte le licenze commerciali esistenti (prima si assumeva ce ne
 * fosse una sola: ora una licenza commerciale può governare 1 o più spazi,
 * quindi ne possono esistere N).
 */
export interface RisultatoElencoLicenze {
  success: boolean;
  licenze: Licenza[];
  error?: string;
}

/**
 * IMPORTANTE: restituisce l'esito, non lo lancia — vedi la nota su
 * ottieniSpaziAction in spazi.ts: Next.js maschera comunque il messaggio di
 * qualsiasi errore lanciato da una Server Action in produzione.
 */
export async function elencaLicenzeCommerciali(): Promise<RisultatoElencoLicenze> {
  try {
    await assicuraTabellaLicenze();
    const res = await pool.query('SELECT * FROM licenze ORDER BY data_attivazione DESC');
    return { success: true, licenze: res.rows as Licenza[] };
  } catch (error: any) {
    console.error('Errore nel recupero delle licenze commerciali:', error);
    return {
      success: false,
      licenze: [],
      error: `Impossibile caricare le licenze commerciali: ${error.message || error}`,
    };
  }
}

/** Recupera una singola licenza commerciale per id (per l'editing di quella specifica). */
export async function getLicenzaPerId(idLicenza: string): Promise<Licenza | null> {
  try {
    await assicuraTabellaLicenze();
    const res = await pool.query('SELECT * FROM licenze WHERE id_licenza = $1', [idLicenza]);
    if (res.rows.length === 0) return null;
    return res.rows[0] as Licenza;
  } catch (error) {
    // Non lanciato di proposito: qualunque chiamante (creaSpazioAction,
    // ModuloLicenza.tsx) tratta già "null" come "licenza non trovata" — un
    // errore di database qui si comporta allo stesso modo lato utente,
    // invece di far uscire un errore mascherato non gestito.
    console.error('Errore nel recupero della licenza:', error);
    return null;
  }
}

/**
 * Crea SEMPRE una nuova licenza commerciale. Sostituisce la precedente
 * inizializzaLicenzaSistema, che in realtà faceva da singleton: controllava
 * se esisteva già una riga e, in caso affermativo, restituiva quella invece
 * di crearne una nuova — comportamento corretto quando si presumeva ne
 * esistesse una sola, sbagliato ora che ne servono N.
 */
export interface RisultatoLicenza {
  success: boolean;
  licenza?: Licenza;
  error?: string;
}

export async function creaLicenzaCommercialeAction(
  ragioneSociale: string
): Promise<RisultatoLicenza> {
  try {
    await assicuraTabellaLicenze();
    const nuovaChiave = generaChiaveLicenza(ragioneSociale);
    const query = `
      INSERT INTO licenze (
        id_licenza, ragione_sociale, max_spazi, max_aziende, max_utenti, data_scadenza
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const dataScadenzaDefault = new Date();
    dataScadenzaDefault.setFullYear(dataScadenzaDefault.getFullYear() + 1);

    const values = [
      nuovaChiave,
      ragioneSociale,
      5,
      10,
      15,
      dataScadenzaDefault.toISOString().split('T')[0],
    ];

    const res = await pool.query(query, values);
    return { success: true, licenza: res.rows[0] as Licenza };
  } catch (error: any) {
    console.error('Errore nella creazione della licenza commerciale:', error);
    return {
      success: false,
      error: `Impossibile creare la licenza commerciale: ${error.message || error}`,
    };
  }
}

/** Quanti spazi sono già collegati a questa licenza commerciale, per verificarne la capienza (max_spazi). */
export async function contaSpaziPerLicenza(idLicenza: string): Promise<number> {
  try {
    const res = await pool.query(
      'SELECT COUNT(*) AS totale FROM licenze_spazio WHERE licenza_commerciale_id = $1',
      [idLicenza]
    );
    return parseInt(res.rows[0].totale, 10) || 0;
  } catch (error) {
    console.error('Errore nel conteggio degli spazi per licenza:', error);
    // 0 è la scelta più sicura in caso di errore: se la tabella non esiste
    // ancora davvero, il tentativo di INSERT successivo fallirà comunque
    // con un errore leggibile, invece di bloccare qui la creazione con un
    // conteggio inaffidabile.
    return 0;
  }
}

export interface RisultatoRigenerazioneChiave {
  success: boolean;
  nuovaChiave?: string;
  error?: string;
}

/**
 * Rigenera la chiave primaria della licenza esistente, mantenendo la parte
 * "parlante" (ragione sociale) e cambiando solo il suffisso casuale.
 */
export async function rigeneraChiaveLicenza(
  chiaveAttuale: string
): Promise<RisultatoRigenerazioneChiave> {
  try {
    const attuale = await getLicenzaPerId(chiaveAttuale);
    if (!attuale) {
      return { success: false, error: 'Licenza non trovata.' };
    }
    const nuovaChiave = generaChiaveLicenza(attuale.ragione_sociale);
    const query = `
      UPDATE licenze
      SET id_licenza = $1
      WHERE id_licenza = $2
      RETURNING id_licenza;
    `;
    const res = await pool.query(query, [nuovaChiave, chiaveAttuale]);
    if (res.rowCount === 0) {
      return { success: false, error: 'Licenza non trovata.' };
    }
    return { success: true, nuovaChiave: res.rows[0].id_licenza };
  } catch (error: any) {
    console.error('Errore durante la rigenerazione della chiave:', error);
    return {
      success: false,
      error: `Impossibile rigenerare la chiave licenza: ${error.message || error}`,
    };
  }
}

export interface RisultatoSalvataggio {
  success: boolean;
  error?: string;
}

export async function salvaParametriLicenza(
  idLicenza: string,
  parametri: { maxSpazi: number; maxAziende: number; maxUtenti: number; dataScadenza: string }
): Promise<RisultatoSalvataggio> {
  try {
    const query = `
      UPDATE licenze
      SET max_spazi = $1, max_aziende = $2, max_utenti = $3, data_scadenza = $4
      WHERE id_licenza = $5;
    `;
    const values = [
      parametri.maxSpazi,
      parametri.maxAziende,
      parametri.maxUtenti,
      parametri.dataScadenza || null,
      idLicenza,
    ];
    const res = await pool.query(query, values);
    return { success: res.rowCount !== null && res.rowCount > 0 };
  } catch (error: any) {
    console.error('Errore nel salvataggio dei parametri:', error);
    return { success: false, error: `Impossibile salvare i parametri: ${error.message || error}` };
  }
}

export interface FunzioniPlusLicenza {
  datiSettore: boolean;
  simulazione: boolean;
  relazioneAi: boolean;
}

/**
 * Funzioni plus di DEFAULT per questa licenza commerciale — ogni nuovo
 * spazio creato sotto questa licenza le eredita al momento della
 * creazione (vedi creaSpazioAction). Non retroattivo sugli spazi già
 * esistenti: quelli restano su quanto scelto quando sono stati creati,
 * modificabile singolarmente da Manutenzione Spazi — stesso principio
 * già visto altrove nel progetto (una modifica a un modello/default non
 * cambia chi ne ha già fatto una copia propria).
 */
export async function salvaFunzioniPlusLicenzaAction(
  idLicenza: string,
  funzioni: FunzioniPlusLicenza
): Promise<RisultatoSalvataggio> {
  try {
    const res = await pool.query(
      `UPDATE licenze SET plus_dati_settore = $1, plus_simulazione = $2, plus_relazione_ai = $3 WHERE id_licenza = $4`,
      [funzioni.datiSettore, funzioni.simulazione, funzioni.relazioneAi, idLicenza]
    );
    return { success: res.rowCount !== null && res.rowCount > 0 };
  } catch (error: any) {
    console.error('Errore nel salvataggio delle funzioni plus:', error);
    return {
      success: false,
      error: `Impossibile salvare le funzioni plus: ${error.message || error}`,
    };
  }
}

export async function salvaAnagraficaLicenza(
  idLicenza: string,
  anagrafica: {
    ragione_sociale: string;
    codice_fiscale?: string;
    partita_iva?: string;
    indirizzo?: string;
    cap?: string;
    citta?: string;
    pec?: string;
  }
): Promise<RisultatoSalvataggio> {
  try {
    const query = `
      UPDATE licenze
      SET ragione_sociale = $1, codice_fiscale = $2, partita_iva = $3, indirizzo = $4, cap = $5, citta = $6, pec = $7
      WHERE id_licenza = $8;
    `;
    const values = [
      anagrafica.ragione_sociale,
      anagrafica.codice_fiscale || null,
      anagrafica.partita_iva || null,
      anagrafica.indirizzo || null,
      anagrafica.cap || null,
      anagrafica.citta || null,
      anagrafica.pec || null,
      idLicenza,
    ];
    const res = await pool.query(query, values);
    return { success: res.rowCount !== null && res.rowCount > 0 };
  } catch (error: any) {
    console.error("Errore nel salvataggio dell'anagrafica:", error);
    return {
      success: false,
      error: `Impossibile salvare i dati anagrafici: ${error.message || error}`,
    };
  }
}

// ============================================================================
// Stato commerciale della licenza: sospensione o cessazione anticipata,
// indipendenti dalla scadenza naturale (data_scadenza). Una licenza sospesa
// o cessata blocca la creazione di nuovi spazi legati ad essa (verificato in
// creaSpazioAction) — non cancella né tocca gli spazi già esistenti.
// ============================================================================

export async function sospendiLicenzaAction(
  idLicenza: string,
  motivo?: string
): Promise<RisultatoSalvataggio> {
  try {
    const res = await pool.query(
      `UPDATE licenze SET stato = 'SOSPESA', data_sospensione = now(), motivo_stato = $2 WHERE id_licenza = $1`,
      [idLicenza, motivo || null]
    );
    return { success: res.rowCount !== null && res.rowCount > 0 };
  } catch (error: any) {
    console.error('Errore durante la sospensione della licenza:', error);
    return {
      success: false,
      error: `Impossibile sospendere la licenza: ${error.message || error}`,
    };
  }
}

export async function riattivaLicenzaAction(idLicenza: string): Promise<RisultatoSalvataggio> {
  try {
    const res = await pool.query(
      `UPDATE licenze SET stato = 'ATTIVA', data_sospensione = NULL, motivo_stato = NULL WHERE id_licenza = $1`,
      [idLicenza]
    );
    return { success: res.rowCount !== null && res.rowCount > 0 };
  } catch (error: any) {
    console.error('Errore durante la riattivazione della licenza:', error);
    return {
      success: false,
      error: `Impossibile riattivare la licenza: ${error.message || error}`,
    };
  }
}

export async function cessaLicenzaAction(
  idLicenza: string,
  motivo?: string
): Promise<RisultatoSalvataggio> {
  try {
    const res = await pool.query(
      `UPDATE licenze SET stato = 'CESSATA', data_cessazione = now(), motivo_stato = $2 WHERE id_licenza = $1`,
      [idLicenza, motivo || null]
    );
    return { success: res.rowCount !== null && res.rowCount > 0 };
  } catch (error: any) {
    console.error('Errore durante la cessazione della licenza:', error);
    return { success: false, error: `Impossibile cessare la licenza: ${error.message || error}` };
  }
}
