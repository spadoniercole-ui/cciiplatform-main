'use server';

// Parametri di Spazio: quali dei 9 indici che il motore XBRL calcola
// davvero (src/lib/xbrl/indici.ts: C1-C5 CNDCEC + ROE/ROI/ROT-ATT/INC-DEB)
// usare in questo spazio, e i limiti di ricevibilità di una proposta per
// categoria di creditore. Vivono nello schema del tenant.
//
// CORREZIONE: prima questa lista veniva letta dal "Dizionario Indici" del
// superadmin (tabella globale `indici`) — una lista generica, curata a
// mano, senza nessuna chiave in comune con i codici che il motore XBRL usa
// davvero (C1, ROE, ecc: qui era un id numerico arbitrario). Risultato:
// selezionare o deselezionare un indice lì non cambiava nulla di reale,
// perché nessun modulo di calcolo la leggeva. Ora la lista è quella
// realmente calcolata, cablata qui una sola volta (unica fonte, stesso
// principio già seguito in src/lib/xbrl/indici.ts): selezionarla o meno
// ha un effetto reale su cosa lo Scenario mostrerà dopo un caricamento
// XBRL. Il Dizionario Indici del superadmin resta un modulo a sé, per un
// uso futuro eventualmente diverso — non più agganciato qui.

import { pool } from '@/lib/db';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import { INDICI_XBRL_CANONICI } from '@/lib/indiciXbrlCanonici';
import { CATEGORIA_SENTINELLA_ENTE } from '@/lib/costantiRicevibilita';
import { RANGHI_LEGALI, type RangoLegale } from '@/lib/proposta/rangoLegale';
import {
  MAX_ANNI_STORICO_DEFAULT,
  MIN_ANNI_STORICO,
  MAX_ANNI_STORICO_LIMITE,
  normalizzaAnniStorico,
} from '@/lib/parametriPeriodi';
import {
  SCREENING_MAX_TOKENS_DEFAULT,
  SCREENING_MAX_TOKENS_MIN,
  SCREENING_MAX_TOKENS_LIMITE,
  normalizzaScreeningMaxTokens,
  SCREENING_MAX_DOMANDE_MIN,
  SCREENING_MAX_DOMANDE_LIMITE,
  SCREENING_MAX_DIRETTRICI_MIN,
  SCREENING_MAX_DIRETTRICI_LIMITE,
  SCREENING_MAX_PRODOTTI_MIN,
  SCREENING_MAX_PRODOTTI_LIMITE,
  normalizzaMaxDomande,
  normalizzaMaxDirettrici,
  normalizzaMaxProdotti,
} from '@/lib/parametriGenerazione';

export interface IndiceMaster {
  id: number;
  codice: string;
  categoria: string;
  nome: string;
  abilitato: boolean;
}

export interface RisultatoIndiciSpazio {
  success: boolean;
  indici: IndiceMaster[];
  error?: string;
}

export async function ottieniIndiciSpazio(nomeSchema: string): Promise<RisultatoIndiciSpazio> {
  try {
    await assicuraTabelleParametriSpazio(nomeSchema);
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, indici: [], error: 'Nome schema non valido.' };
    }

    const override = await pool.query(
      `SELECT indice_id, abilitato FROM "${nomeSchema}".indici_abilitati`
    );
    const mappaOverride: Record<number, boolean> = {};
    for (const riga of override.rows) mappaOverride[riga.indice_id] = riga.abilitato;

    return {
      success: true,
      indici: INDICI_XBRL_CANONICI.map((r) => ({
        id: r.id,
        codice: r.codice,
        categoria: r.categoria,
        nome: r.nome,
        abilitato: mappaOverride[r.id] ?? true, // default abilitato se non specificato
      })),
    };
  } catch (error: any) {
    console.error('[ottieniIndiciSpazio] Errore:', error);
    return {
      success: false,
      indici: [],
      error: `Impossibile caricare gli indici: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneParametri {
  success: boolean;
  error?: string;
}

export async function impostaIndiceAbilitatoAction(
  nomeSchema: string,
  indiceId: number,
  abilitato: boolean
): Promise<RisultatoOperazioneParametri> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".indici_abilitati SET abilitato = $2 WHERE indice_id = $1`,
      [indiceId, abilitato]
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".indici_abilitati (indice_id, abilitato) VALUES ($1, $2)`,
        [indiceId, abilitato]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[impostaIndiceAbilitatoAction] Errore:', error);
    return { success: false, error: `Impossibile aggiornare l'indice: ${error.message || error}` };
  }
}

export interface LimiteRicevibilita {
  id: number;
  categoriaCreditore: string;
  /** Nomi alternativi che puntano allo stesso limite — "INPS" può comparire come "Enti previdenziali", "Ente previdenziale", ecc. a seconda di chi scrive la riga. */
  alias: string[];
  percentualeMinima: number;
  unicaSoluzioneAmmessa: boolean;
  rateizzazioneAmmessa: boolean;
  note: string | null;
  // Criterio corretto ex CCII per la ricevibilità: valore assoluto in euro
  // che il creditore otterrebbe in liquidazione giudiziale, stimato
  // dall'Esperto/professionista. Se configurato, prevale come test
  // principale sulla percentualeMinima (che resta un pavimento aggiuntivo
  // se impostata).
  valoreLiquidazioneStimato: number | null;
}

export interface RisultatoLimitiRicevibilita {
  success: boolean;
  limiti: LimiteRicevibilita[];
  error?: string;
}

const CATEGORIE_DEFAULT = [
  {
    categoria: 'Generale',
    percentuale: 0,
    note: 'Soglia di fallback per creditori non elencati esplicitamente.',
  },
  {
    categoria: 'INPS',
    percentuale: 100,
    note: 'Non considera ricevibile una proposta sotto il 100%, in unica soluzione o a rate.',
  },
  { categoria: 'Agenzia Entrate', percentuale: 0, note: null },
  { categoria: 'Banche', percentuale: 0, note: null },
  { categoria: 'Fornitori', percentuale: 0, note: null },
];

export async function ottieniLimitiRicevibilita(
  nomeSchema: string,
  tipoSpazio?: 'ENTE' | 'NON_ENTE'
): Promise<RisultatoLimitiRicevibilita> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, limiti: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);

    if (tipoSpazio === 'ENTE') {
      // Un solo limite, non N — crea la riga sentinella se manca (non
      // cancella eventuali categorie NON_ENTE già presenti: restano lì,
      // inutilizzate, se lo spazio torna NON_ENTE in futuro).
      await pool.query(
        `INSERT INTO "${nomeSchema}".limiti_ricevibilita (categoria_creditore, percentuale_minima, note)
         VALUES ($1, 0, 'Soglia unica di ricevibilità per questo ente.')
         ON CONFLICT (categoria_creditore) DO NOTHING`,
        [CATEGORIA_SENTINELLA_ENTE]
      );
      const rigaEnte = await pool.query(
        `SELECT id, categoria_creditore, percentuale_minima, unica_soluzione_ammessa, rateizzazione_ammessa, note, valore_liquidazione_stimato, alias
         FROM "${nomeSchema}".limiti_ricevibilita WHERE categoria_creditore = $1`,
        [CATEGORIA_SENTINELLA_ENTE]
      );
      return { success: true, limiti: rigaEnte.rows.map(mappaRigaLimite) };
    }

    const esistenti = await pool.query(
      `SELECT id, categoria_creditore, percentuale_minima, unica_soluzione_ammessa, rateizzazione_ammessa, note, valore_liquidazione_stimato, alias
       FROM "${nomeSchema}".limiti_ricevibilita WHERE categoria_creditore != $1`,
      [CATEGORIA_SENTINELLA_ENTE]
    );

    // Se la tabella è vuota (primo utilizzo), la popola con le categorie di
    // default: sono un punto di partenza ragionevole da poter modificare
    // subito, non un dato immutabile.
    if (esistenti.rows.length === 0) {
      for (const cat of CATEGORIE_DEFAULT) {
        await pool.query(
          `INSERT INTO "${nomeSchema}".limiti_ricevibilita (categoria_creditore, percentuale_minima, note)
           VALUES ($1, $2, $3) ON CONFLICT (categoria_creditore) DO NOTHING`,
          [cat.categoria, cat.percentuale, cat.note]
        );
      }
      const dopoInserimento = await pool.query(
        `SELECT id, categoria_creditore, percentuale_minima, unica_soluzione_ammessa, rateizzazione_ammessa, note, valore_liquidazione_stimato, alias
         FROM "${nomeSchema}".limiti_ricevibilita WHERE categoria_creditore != $1`,
        [CATEGORIA_SENTINELLA_ENTE]
      );
      return {
        success: true,
        limiti: dopoInserimento.rows.map(mappaRigaLimite),
      };
    }

    return { success: true, limiti: esistenti.rows.map(mappaRigaLimite) };
  } catch (error: any) {
    console.error('[ottieniLimitiRicevibilita] Errore:', error);
    return {
      success: false,
      limiti: [],
      error: `Impossibile caricare i limiti: ${error.message || error}`,
    };
  }
}

// ============================================================================
// Limiti di ricevibilità per RANGO LEGALE — secondo livello di
// corrispondenza quando una riga della proposta non combacia per nome
// esatto con nessuna categoria configurata sopra (nomi liberi come "Enti
// previdenziali" non trovano "INPS"). Il rango è un insieme chiuso di 6
// valori (src/lib/proposta/rangoLegale.ts), non personalizzabile per
// spazio: si possono solo impostarne le soglie, non aggiungerne o
// toglierne.
// ============================================================================

export interface LimiteRicevibilitaRango {
  rangoLegale: RangoLegale;
  percentualeMinima: number;
  unicaSoluzioneAmmessa: boolean;
  rateizzazioneAmmessa: boolean;
  valoreLiquidazioneStimato: number | null;
  note: string | null;
}

export interface RisultatoLimitiRicevibilitaRango {
  success: boolean;
  limiti: LimiteRicevibilitaRango[];
  error?: string;
}

function mappaRigaLimiteRango(r: any): LimiteRicevibilitaRango {
  return {
    rangoLegale: r.rango_legale,
    percentualeMinima: r.percentuale_minima,
    unicaSoluzioneAmmessa: r.unica_soluzione_ammessa,
    rateizzazioneAmmessa: r.rateizzazione_ammessa,
    valoreLiquidazioneStimato:
      r.valore_liquidazione_stimato === null || r.valore_liquidazione_stimato === undefined
        ? null
        : Number(r.valore_liquidazione_stimato),
    note: r.note,
  };
}

export async function ottieniLimitiRicevibilitaRango(
  nomeSchema: string
): Promise<RisultatoLimitiRicevibilitaRango> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, limiti: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);

    const esistenti = await pool.query(
      `SELECT rango_legale, percentuale_minima, unica_soluzione_ammessa, rateizzazione_ammessa, valore_liquidazione_stimato, note
       FROM "${nomeSchema}".limiti_ricevibilita_rango`
    );

    if (esistenti.rows.length === 0) {
      for (const r of RANGHI_LEGALI) {
        await pool.query(
          `INSERT INTO "${nomeSchema}".limiti_ricevibilita_rango (rango_legale) VALUES ($1)
           ON CONFLICT (rango_legale) DO NOTHING`,
          [r.valore]
        );
      }
      const dopoInserimento = await pool.query(
        `SELECT rango_legale, percentuale_minima, unica_soluzione_ammessa, rateizzazione_ammessa, valore_liquidazione_stimato, note
         FROM "${nomeSchema}".limiti_ricevibilita_rango`
      );
      return { success: true, limiti: dopoInserimento.rows.map(mappaRigaLimiteRango) };
    }

    return { success: true, limiti: esistenti.rows.map(mappaRigaLimiteRango) };
  } catch (error: any) {
    console.error('[ottieniLimitiRicevibilitaRango] Errore:', error);
    return {
      success: false,
      limiti: [],
      error: `Impossibile caricare i limiti per rango: ${error.message || error}`,
    };
  }
}

export async function aggiornaLimiteRicevibilitaRangoAction(
  nomeSchema: string,
  rangoLegale: RangoLegale,
  dati: {
    percentualeMinima: number;
    unicaSoluzioneAmmessa: boolean;
    rateizzazioneAmmessa: boolean;
    note: string | null;
    valoreLiquidazioneStimato?: number | null;
  }
): Promise<RisultatoOperazioneParametri> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    await pool.query(
      `UPDATE "${nomeSchema}".limiti_ricevibilita_rango
       SET percentuale_minima = $1, unica_soluzione_ammessa = $2, rateizzazione_ammessa = $3, note = $4,
           valore_liquidazione_stimato = $5
       WHERE rango_legale = $6`,
      [
        dati.percentualeMinima,
        dati.unicaSoluzioneAmmessa,
        dati.rateizzazioneAmmessa,
        dati.note,
        dati.valoreLiquidazioneStimato ?? null,
        rangoLegale,
      ]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaLimiteRicevibilitaRangoAction] Errore:', error);
    return { success: false, error: `Impossibile aggiornare il limite: ${error.message || error}` };
  }
}

function mappaRigaLimite(r: any): LimiteRicevibilita {
  return {
    id: r.id,
    categoriaCreditore: r.categoria_creditore,
    alias: r.alias || [],
    percentualeMinima: r.percentuale_minima,
    unicaSoluzioneAmmessa: r.unica_soluzione_ammessa,
    rateizzazioneAmmessa: r.rateizzazione_ammessa,
    note: r.note,
    valoreLiquidazioneStimato:
      r.valore_liquidazione_stimato === null || r.valore_liquidazione_stimato === undefined
        ? null
        : Number(r.valore_liquidazione_stimato),
  };
}

export async function aggiornaLimiteRicevibilitaAction(
  nomeSchema: string,
  id: number,
  dati: {
    percentualeMinima: number;
    unicaSoluzioneAmmessa: boolean;
    rateizzazioneAmmessa: boolean;
    note: string | null;
    valoreLiquidazioneStimato?: number | null;
    alias?: string[];
  }
): Promise<RisultatoOperazioneParametri> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    await pool.query(
      `UPDATE "${nomeSchema}".limiti_ricevibilita
       SET percentuale_minima = $1, unica_soluzione_ammessa = $2, rateizzazione_ammessa = $3, note = $4,
           valore_liquidazione_stimato = $5, alias = $6
       WHERE id = $7`,
      [
        dati.percentualeMinima,
        dati.unicaSoluzioneAmmessa,
        dati.rateizzazioneAmmessa,
        dati.note,
        dati.valoreLiquidazioneStimato ?? null,
        dati.alias ?? [],
        id,
      ]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaLimiteRicevibilitaAction] Errore:', error);
    return { success: false, error: `Impossibile aggiornare il limite: ${error.message || error}` };
  }
}

export async function creaCategoriaLimiteAction(
  nomeSchema: string,
  categoria: string
): Promise<RisultatoOperazioneParametri> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (!categoria.trim()) {
      return { success: false, error: 'Il nome della categoria è obbligatorio.' };
    }
    await pool.query(
      `INSERT INTO "${nomeSchema}".limiti_ricevibilita (categoria_creditore) VALUES ($1)
       ON CONFLICT (categoria_creditore) DO NOTHING`,
      [categoria.trim()]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[creaCategoriaLimiteAction] Errore:', error);
    return { success: false, error: `Impossibile creare la categoria: ${error.message || error}` };
  }
}

// ============================================================================
// Tab del motore XBRL da attivare nell'Import XBRL di ogni azienda dello
// spazio. Il motore (src/lib/xbrl) resta unico e condiviso; qui si sceglie
// solo quali delle sue viste mostrare — non tutte servono a ogni studio
// (es. la Parificazione Tag, tenuta fuori da questo primo giro perché
// agisce su una tabella globale condivisa tra spazi, non tenant-scoped).
// ============================================================================

export interface TabXbrl {
  codice: string;
  etichetta: string;
  abilitato: boolean;
}

const TAB_XBRL_DEFAULT: { codice: string; etichetta: string }[] = [
  { codice: 'cndec', etichetta: 'Indici CNDCEC' },
  { codice: 'altri_indici', etichetta: 'Altri Indici' },
  { codice: 'debitoria', etichetta: 'Situazione Debitoria' },
  { codice: 'storico', etichetta: 'Andamento Storico' },
];

export interface RisultatoTabXbrl {
  success: boolean;
  tab: TabXbrl[];
  error?: string;
}

export async function ottieniTabXbrlAbilitate(nomeSchema: string): Promise<RisultatoTabXbrl> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, tab: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);

    const esistenti = await pool.query(
      `SELECT tab_codice, abilitato FROM "${nomeSchema}".xbrl_tab_abilitate`
    );

    if (esistenti.rows.length === 0) {
      for (const t of TAB_XBRL_DEFAULT) {
        await pool.query(
          `INSERT INTO "${nomeSchema}".xbrl_tab_abilitate (tab_codice) VALUES ($1)
           ON CONFLICT (tab_codice) DO NOTHING`,
          [t.codice]
        );
      }
      return {
        success: true,
        tab: TAB_XBRL_DEFAULT.map((t) => ({ ...t, abilitato: true })),
      };
    }

    const statoPerCodice = new Map(esistenti.rows.map((r) => [r.tab_codice, r.abilitato]));
    return {
      success: true,
      tab: TAB_XBRL_DEFAULT.map((t) => ({
        ...t,
        abilitato: statoPerCodice.get(t.codice) ?? true,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniTabXbrlAbilitate] Errore:', error);
    return {
      success: false,
      tab: [],
      error: `Impossibile caricare le tab XBRL: ${error.message || error}`,
    };
  }
}

export async function impostaTabXbrlAbilitataAction(
  nomeSchema: string,
  tabCodice: string,
  abilitato: boolean
): Promise<RisultatoOperazioneParametri> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".xbrl_tab_abilitate SET abilitato = $2 WHERE tab_codice = $1`,
      [tabCodice, abilitato]
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".xbrl_tab_abilitate (tab_codice, abilitato) VALUES ($1, $2)`,
        [tabCodice, abilitato]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[impostaTabXbrlAbilitataAction] Errore:', error);
    return { success: false, error: `Impossibile aggiornare la tab: ${error.message || error}` };
  }
}

/** Solo Redigente — non una soglia per categoria (quella la decide
 * l'ente ricevente), ma la percentuale di base da cui parte una nuova
 * riga di Proposta, modificabile riga per riga. */
export async function ottieniPercentualeMediaProposta(
  nomeSchema: string
): Promise<{ success: boolean; percentuale: number; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, percentuale: 30, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    const risultato = await pool.query(
      `SELECT percentuale_media_default FROM "${nomeSchema}".parametri_proposta_redigente LIMIT 1`
    );
    if (risultato.rows.length === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".parametri_proposta_redigente (percentuale_media_default) VALUES (30)`
      );
      return { success: true, percentuale: 30 };
    }
    return { success: true, percentuale: risultato.rows[0].percentuale_media_default };
  } catch (error: any) {
    console.error('[ottieniPercentualeMediaProposta] Errore:', error);
    return {
      success: false,
      percentuale: 30,
      error: `Impossibile leggere il parametro: ${error.message || error}`,
    };
  }
}

export async function aggiornaPercentualeMediaPropostaAction(
  nomeSchema: string,
  percentuale: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (percentuale < 0 || percentuale > 100) {
      return { success: false, error: 'La percentuale deve essere tra 0 e 100.' };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    const esistente = await pool.query(
      `SELECT id FROM "${nomeSchema}".parametri_proposta_redigente LIMIT 1`
    );
    if (esistente.rows.length === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".parametri_proposta_redigente (percentuale_media_default) VALUES ($1)`,
        [percentuale]
      );
    } else {
      await pool.query(
        `UPDATE "${nomeSchema}".parametri_proposta_redigente SET percentuale_media_default = $1 WHERE id = $2`,
        [percentuale, esistente.rows[0].id]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaPercentualeMediaPropostaAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

/** Orizzonte di storico XBRL a video (Indici multi-periodo + Posizione
 * Aggiornata): parametro per-spazio con default di sistema. `anni` è il
 * valore effettivo già normalizzato nell'intervallo consentito;
 * `personalizzato` dice se lo spazio ha impostato un proprio valore o sta
 * usando il default. */
export async function ottieniAnniStoricoMax(
  nomeSchema: string
): Promise<{ success: boolean; anni: number; personalizzato: boolean; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return {
        success: false,
        anni: MAX_ANNI_STORICO_DEFAULT,
        personalizzato: false,
        error: 'Nome schema non valido.',
      };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    const risultato = await pool.query(
      `SELECT anni_storico_max FROM "${nomeSchema}".parametri_visualizzazione WHERE id = 1`
    );
    const grezzo: number | null = risultato.rows[0]?.anni_storico_max ?? null;
    return {
      success: true,
      anni: normalizzaAnniStorico(grezzo),
      personalizzato: grezzo !== null,
    };
  } catch (error: any) {
    console.error('[ottieniAnniStoricoMax] Errore:', error);
    return {
      success: false,
      anni: MAX_ANNI_STORICO_DEFAULT,
      personalizzato: false,
      error: `Impossibile leggere il parametro: ${error.message || error}`,
    };
  }
}

/** Imposta l'orizzonte per-spazio. `anni = null` azzera l'override e torna
 * al default di sistema. Un valore fuori intervallo è rifiutato. */
export async function aggiornaAnniStoricoMaxAction(
  nomeSchema: string,
  anni: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (anni !== null && (anni < MIN_ANNI_STORICO || anni > MAX_ANNI_STORICO_LIMITE)) {
      return {
        success: false,
        error: `Il numero di anni deve essere tra ${MIN_ANNI_STORICO} e ${MAX_ANNI_STORICO_LIMITE}.`,
      };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    // Riga unica id=1: upsert (vale sia per impostare un valore sia per
    // azzerarlo a NULL = default di sistema).
    await pool.query(
      `INSERT INTO "${nomeSchema}".parametri_visualizzazione (id, anni_storico_max)
       VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET anni_storico_max = EXCLUDED.anni_storico_max`,
      [anni]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaAnniStoricoMaxAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

/** Tetto di token in output per il questionario di Screening generato
 * dall'AI (per-spazio, con default di sistema). Alzarlo evita il
 * troncamento del JSON quando le direttrici/domande sono molte. */
export async function ottieniScreeningMaxTokens(
  nomeSchema: string
): Promise<{ success: boolean; maxTokens: number; personalizzato: boolean; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return {
        success: false,
        maxTokens: SCREENING_MAX_TOKENS_DEFAULT,
        personalizzato: false,
        error: 'Nome schema non valido.',
      };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    const risultato = await pool.query(
      `SELECT screening_max_tokens FROM "${nomeSchema}".parametri_visualizzazione WHERE id = 1`
    );
    const grezzo: number | null = risultato.rows[0]?.screening_max_tokens ?? null;
    return {
      success: true,
      maxTokens: normalizzaScreeningMaxTokens(grezzo),
      personalizzato: grezzo !== null,
    };
  } catch (error: any) {
    console.error('[ottieniScreeningMaxTokens] Errore:', error);
    return {
      success: false,
      maxTokens: SCREENING_MAX_TOKENS_DEFAULT,
      personalizzato: false,
      error: `Impossibile leggere il parametro: ${error.message || error}`,
    };
  }
}

/** Imposta il tetto di token per-spazio. `maxTokens = null` azzera
 * l'override e torna al default di sistema. Fuori intervallo → rifiutato. */
export async function aggiornaScreeningMaxTokensAction(
  nomeSchema: string,
  maxTokens: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (
      maxTokens !== null &&
      (maxTokens < SCREENING_MAX_TOKENS_MIN || maxTokens > SCREENING_MAX_TOKENS_LIMITE)
    ) {
      return {
        success: false,
        error: `Il tetto di token deve essere tra ${SCREENING_MAX_TOKENS_MIN} e ${SCREENING_MAX_TOKENS_LIMITE}.`,
      };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".parametri_visualizzazione (id, screening_max_tokens)
       VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET screening_max_tokens = EXCLUDED.screening_max_tokens`,
      [maxTokens]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaScreeningMaxTokensAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

export interface LimitiGenerazioneScreening {
  maxDomande: number;
  maxDirettrici: number;
  maxProdotti: number;
}

/** Legge i limiti quantitativi della generazione Screening per-spazio
 * (max domande, max direttrici, max prodotti per direttrice), con fallback
 * ai default di sistema. */
export async function ottieniLimitiScreening(
  nomeSchema: string
): Promise<{ success: boolean; limiti: LimitiGenerazioneScreening; error?: string }> {
  const defaults: LimitiGenerazioneScreening = {
    maxDomande: normalizzaMaxDomande(null),
    maxDirettrici: normalizzaMaxDirettrici(null),
    maxProdotti: normalizzaMaxProdotti(null),
  };
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, limiti: defaults, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    const r = await pool.query(
      `SELECT screening_max_domande, screening_max_direttrici, screening_max_prodotti
         FROM "${nomeSchema}".parametri_visualizzazione WHERE id = 1`
    );
    const row = r.rows[0] || {};
    return {
      success: true,
      limiti: {
        maxDomande: normalizzaMaxDomande(row.screening_max_domande ?? null),
        maxDirettrici: normalizzaMaxDirettrici(row.screening_max_direttrici ?? null),
        maxProdotti: normalizzaMaxProdotti(row.screening_max_prodotti ?? null),
      },
    };
  } catch (error: any) {
    console.error('[ottieniLimitiScreening] Errore:', error);
    return {
      success: false,
      limiti: defaults,
      error: `Impossibile leggere: ${error.message || error}`,
    };
  }
}

/** Imposta i tre limiti insieme. Ogni valore è clampato nel proprio
 * intervallo; valori fuori range vengono rifiutati con messaggio chiaro. */
export async function aggiornaLimitiScreeningAction(
  nomeSchema: string,
  limiti: LimitiGenerazioneScreening
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    const { maxDomande, maxDirettrici, maxProdotti } = limiti;
    if (maxDomande < SCREENING_MAX_DOMANDE_MIN || maxDomande > SCREENING_MAX_DOMANDE_LIMITE) {
      return {
        success: false,
        error: `Il numero di domande deve essere tra ${SCREENING_MAX_DOMANDE_MIN} e ${SCREENING_MAX_DOMANDE_LIMITE}.`,
      };
    }
    if (
      maxDirettrici < SCREENING_MAX_DIRETTRICI_MIN ||
      maxDirettrici > SCREENING_MAX_DIRETTRICI_LIMITE
    ) {
      return {
        success: false,
        error: `Il numero di direttrici deve essere tra ${SCREENING_MAX_DIRETTRICI_MIN} e ${SCREENING_MAX_DIRETTRICI_LIMITE}.`,
      };
    }
    if (maxProdotti < SCREENING_MAX_PRODOTTI_MIN || maxProdotti > SCREENING_MAX_PRODOTTI_LIMITE) {
      return {
        success: false,
        error: `Il numero di prodotti per direttrice deve essere tra ${SCREENING_MAX_PRODOTTI_MIN} e ${SCREENING_MAX_PRODOTTI_LIMITE}.`,
      };
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".parametri_visualizzazione
         (id, screening_max_domande, screening_max_direttrici, screening_max_prodotti)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         screening_max_domande = EXCLUDED.screening_max_domande,
         screening_max_direttrici = EXCLUDED.screening_max_direttrici,
         screening_max_prodotti = EXCLUDED.screening_max_prodotti`,
      [maxDomande, maxDirettrici, maxProdotti]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaLimitiScreeningAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}
