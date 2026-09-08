// src/lib/xbrl/tagMapping.ts
//
// Mappa "tag XBRL pulito" -> "chiave canonica" usata dal resto della pipeline.
// Prova prima la tabella xbrl_tag_mappings (vedi src/db/sql/xbrl_tag_mappings.sql),
// e usa FALLBACK_TAG_MAPPINGS solo se la tabella non è raggiungibile o è vuota.
//
// IMPORTANTE: se questo fallback scatta, il chiamante DEVE saperlo (vedi
// campo `usatoFallback` nel valore di ritorno) — prima la query falliva e
// basta e il fallback scattava in silenzio, perdendo la stragrande
// maggioranza dei tag reali della tassonomia ITCC-CI.
//
// NOTA ARCHITETTURALE: questa tabella è una tabella di sistema globale,
// come `licenze`, `sessioni`, `indici` e `parametri_sistema`. Tutte le
// tabelle di sistema di questo progetto vengono lette/scritte con SQL
// diretto tramite il Pool di `src/lib/db.ts` (vedi src/app/actions/auth.ts,
// src/app/actions/licenze.ts, src/app/api/indici/route.ts) — non con
// Drizzle. Drizzle (src/db/client.ts + src/db/schema.ts) è riservato alle
// tabelle per-tenant a schema Postgres dinamico (getTabelleTenant), un
// meccanismo diverso e intenzionale per il futuro multi-tenant reale.
// In precedenza questo file usava Drizzle solo per questa tabella,
// un'incoerenza rispetto al resto del progetto: corretta qui.

import { pool } from '@/lib/db';
import { pulisciTag } from './parser';

// Copertura minima di sopravvivenza: usata SOLO se la tabella DB non risponde.
// Non aggiungere altri tag qui: vanno inseriti nella tabella xbrl_tag_mappings.
const FALLBACK_TAG_MAPPINGS: Record<string, string> = {
  valoreproduzionericavivenditeprestazioni: 'ricaviVendite',
  ricavidellevenditeedelleprestazioni: 'ricaviVendite',
  totalevaloreproduzione: 'valoreProduzione',
  totalecostiproduzione: 'costiProduzione',
  differenzavalorecostiproduzione: 'ebit',
  interessiedaltrionerifinanziari: 'oneriFinanziari',
  utileperditaesercizio: 'utileEsercizio',
  totaleammortamentierettifichedivalutazione: 'ammortamenti',
  totaleattivocircolante: 'attivoCircolante',
  totaledisponibilitaliquide: 'disponibilitaLiquide',
  totaleimmobilizzazioni: 'immobilizzazioni',
  totalepatrimonionetto: 'patrimonioNetto',
  totaledebiti: 'totaleDebiti',
  debitiversobanche: 'debitiBanche',
  debitiversofornitori: 'debitiFornitori',
  debititributari: 'debitiTributari',
  debitiversoistitutiprevidenzasicurezzasociale: 'debitiPrevidenziali',
  totaleattivo: 'totaleAttivo',
  creditiversoclienti: 'creditiClienti',
};

// Uniche chiavi canoniche realmente lette da lib/xbrl/index.ts (campi di
// DatiFinanziariPeriodo). Se una riga di xbrl_tag_mappings usa una chiave
// fuori da questo elenco (es. per un refuso di convenzione: "totale_debiti"
// invece di "totaleDebiti"), il dato viene scritto su una proprietà che
// nessuno legge e sparisce silenziosamente — è già successo una volta.
// Da qui in poi lo segnaliamo invece di ignorarlo.
const CHIAVI_CANONICHE_VALIDE = new Set([
  'ricaviVendite',
  'valoreProduzione',
  'costiProduzione',
  'ebit',
  'ammortamenti',
  'ebitda',
  'oneriFinanziari',
  'utileEsercizio',
  'totaleAttivo',
  'attivoCircolante',
  'disponibilitaLiquide',
  'immobilizzazioni',
  'patrimonioNetto',
  'totaleDebiti',
  'debitiBanche',
  'debitiFornitori',
  'debitiTributari',
  'debitiPrevidenziali',
  'passivoCorrente',
  'creditiClienti',
]);

export interface RisultatoMapping {
  mappa: Record<string, string>; // tagPulito -> chiaveCanonica
  usatoFallback: boolean;
  /** Chiavi canoniche presenti nella tabella DB ma non corrispondenti a nessun campo reale del motore. */
  chiaviNonRiconosciute: string[];
}

/**
 * Carica il mapping tag->chiave canonica dalla tabella DB, con fallback statico.
 * Il fallback viene segnalato esplicitamente al chiamante (mai più in silenzio).
 */
export async function caricaMappingTag(): Promise<RisultatoMapping> {
  try {
    const risultato = await pool.query('SELECT alias_tag, canonical_key FROM xbrl_tag_mappings');
    if (!risultato.rows || risultato.rows.length === 0) {
      return {
        mappa: { ...FALLBACK_TAG_MAPPINGS },
        usatoFallback: true,
        chiaviNonRiconosciute: [],
      };
    }
    const mappa: Record<string, string> = { ...FALLBACK_TAG_MAPPINGS };
    const chiaviNonRiconosciute = new Set<string>();
    for (const riga of risultato.rows) {
      if (riga.alias_tag && riga.canonical_key) {
        mappa[pulisciTag(riga.alias_tag)] = riga.canonical_key;
        if (!CHIAVI_CANONICHE_VALIDE.has(riga.canonical_key)) {
          chiaviNonRiconosciute.add(riga.canonical_key);
        }
      }
    }
    return {
      mappa,
      usatoFallback: false,
      chiaviNonRiconosciute: Array.from(chiaviNonRiconosciute),
    };
  } catch (error) {
    console.error(
      '[xbrl/tagMapping] Impossibile leggere xbrl_tag_mappings dal DB, uso il fallback statico:',
      error
    );
    return { mappa: { ...FALLBACK_TAG_MAPPINGS }, usatoFallback: true, chiaviNonRiconosciute: [] };
  }
}
