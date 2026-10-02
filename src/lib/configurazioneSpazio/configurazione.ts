// src/lib/configurazioneSpazio/configurazione.ts
//
// CONFIGURAZIONE DELLO SPAZIO in un file: si salva quando i parametri sono
// a punto e si ricarica dopo un azzeramento del database (o su un altro
// spazio dello stesso tipo). Contiene SOLO configurazione — le pagine di
// Parametri di Spazio, direttrici, titoli e materie dell'ente, etichette
// dell'anagrafica ente, mappature V.E.R.A., strutture dei prospetti, stampa
// con il logo — mai aziende, scenari, utenti o licenze.
//
// Il ripristino SOSTITUISCE tabella per tabella (cancella e reinserisce in
// una sola transazione): è una fotografia, non un'unione. Gli id vengono
// conservati, così restano coerenti i riferimenti interni (titoli → materie,
// risposte di Check List → modello) e le sequenze vengono riallineate.
//
// Le colonne si incrociano con quelle del database di arrivo: un file di una
// versione precedente si carica anche se nel frattempo una tabella ha
// guadagnato colonne (prendono il valore predefinito), e colonne sparite
// vengono ignorate e dichiarate.
//
// Accesso al database tramite un `Esecutore` (come il backup): la Server
// Action passa un client del pool, il test passa PGlite.

export type Esecutore = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export const FORMATO_CONFIGURAZIONE = 'CCIIPLATFORM_CONFIGURAZIONE_SPAZIO';
export const VERSIONE_FORMATO = 1;

export interface TabellaConfigurazione {
  nome: string;
  /** Pagina o funzione da cui si gestisce: per il riepilogo all'utente. */
  descrizione: string;
  /** Colonne da NON esportare (stato transitorio). */
  escludi?: string[];
}

/** L'elenco, in ordine di ripristino (materie prima dei titoli). */
export const TABELLE_CONFIGURAZIONE: TabellaConfigurazione[] = [
  { nome: 'parametri_soglie_25novies', descrizione: 'Soglie art. 25-novies' },
  { nome: 'indici_abilitati', descrizione: 'Indici attivi' },
  { nome: 'limiti_ricevibilita', descrizione: 'Parametri di riscontro della proposta' },
  { nome: 'limiti_ricevibilita_rango', descrizione: 'Parametri per rango' },
  { nome: 'parametri_proposta_redigente', descrizione: 'Percentuale media della proposta' },
  { nome: 'parametri_visualizzazione', descrizione: 'Visualizzazione' },
  { nome: 'xbrl_tab_abilitate', descrizione: 'Schede XBRL' },
  { nome: 'checklist_pesi_domande', descrizione: 'Check List: pesi delle domande' },
  { nome: 'checklist_config_pesi', descrizione: 'Check List: parametri' },
  { nome: 'checklist_ministeriale_snapshot', descrizione: 'Check List ministeriale' },
  { nome: 'checklist_colonne_config', descrizione: 'Check List: colonne' },
  { nome: 'checklist_campi_extra', descrizione: 'Check List: campi aggiuntivi' },
  { nome: 'checklist_modelli', descrizione: 'Check List: modelli' },
  { nome: 'materie_ente', descrizione: 'Materie dell’ente' },
  { nome: 'titoli_ente', descrizione: 'Titoli di credito dell’ente' },
  {
    nome: 'titoli_ente_config',
    descrizione: 'Sito istituzionale dell’ente',
    escludi: ['lotto_ricerca_id', 'lotto_ricerca_il'],
  },
  { nome: 'parametri_confronto_piano', descrizione: 'Confronto con il piano' },
  { nome: 'parametri_stampa', descrizione: 'Stampa (intestazione, piè di pagina, logo)' },
  { nome: 'parametri_iai', descrizione: 'Indice IAI' },
  { nome: 'anagrafica_ente_config', descrizione: 'Etichette dell’Anagrafica Ente' },
  { nome: 'categorie_tipo_debito', descrizione: 'Categorie di debito' },
  { nome: 'tipo_debito_config', descrizione: 'Etichette dei tipi di debito' },
  { nome: 'vera_titoli', descrizione: 'V.E.R.A.: titoli di sezione mappati' },
  { nome: 'vera_trattamenti', descrizione: 'V.E.R.A.: trattamenti natura/stato' },
  { nome: 'strutture_prospetto', descrizione: 'Strutture dei prospetti riconosciute' },
  { nome: 'debiti_ente_tracciati', descrizione: 'Tracciati dei file dell’ente' },
];

export interface FileConfigurazione {
  formato: typeof FORMATO_CONFIGURAZIONE;
  versione: number;
  appVersion: string;
  esportatoIl: string;
  spazio: { codice: string; tipoSpazio: string | null };
  /** Configurazione che sta nella tabella globale degli spazi. */
  globale: { direttriciEnteStrutturate: unknown };
  tabelle: Record<string, { righe: Record<string, unknown>[] }>;
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function colonneDi(
  esegui: Esecutore,
  schema: string,
  tabella: string
): Promise<Map<string, string>> {
  const r = await esegui(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, tabella]
  );
  return new Map(r.map((x) => [String(x.column_name), String(x.data_type)]));
}

/** Legge la configurazione dello schema. Le tabelle che non esistono ancora si saltano. */
export async function esportaConfigurazione(
  esegui: Esecutore,
  schema: string,
  meta: {
    codice: string;
    tipoSpazio: string | null;
    appVersion: string;
    direttriciEnteStrutturate: unknown;
  }
): Promise<FileConfigurazione> {
  const tabelle: FileConfigurazione['tabelle'] = {};
  for (const t of TABELLE_CONFIGURAZIONE) {
    const colonne = await colonneDi(esegui, schema, t.nome);
    if (colonne.size === 0) continue;
    const scelte = Array.from(colonne.keys()).filter((c) => !t.escludi?.includes(c));
    const ordine = colonne.has('id') ? ' ORDER BY id' : '';
    const righe = await esegui(
      `SELECT ${scelte.map(q).join(', ')} FROM ${q(schema)}.${q(t.nome)}${ordine}`
    );
    tabelle[t.nome] = { righe };
  }
  return {
    formato: FORMATO_CONFIGURAZIONE,
    versione: VERSIONE_FORMATO,
    appVersion: meta.appVersion,
    esportatoIl: new Date().toISOString(),
    spazio: { codice: meta.codice, tipoSpazio: meta.tipoSpazio },
    globale: { direttriciEnteStrutturate: meta.direttriciEnteStrutturate ?? null },
    tabelle,
  };
}

/** Controllo del file prima di qualunque scrittura. Restituisce l'errore o null. */
export function validaFileConfigurazione(grezzo: unknown): string | null {
  if (!grezzo || typeof grezzo !== 'object') return 'Il file non contiene una configurazione.';
  const f = grezzo as Partial<FileConfigurazione>;
  if (f.formato !== FORMATO_CONFIGURAZIONE)
    return 'Il file non è una configurazione di spazio di CCIIPlatform.';
  if (typeof f.versione !== 'number' || f.versione > VERSIONE_FORMATO)
    return 'Il file è stato prodotto da una versione più recente della piattaforma: aggiorna prima la piattaforma.';
  if (!f.tabelle || typeof f.tabelle !== 'object') return 'Il file non contiene tabelle.';
  for (const [nome, t] of Object.entries(f.tabelle)) {
    if (!t || !Array.isArray((t as { righe?: unknown }).righe))
      return `Tabella «${nome}» non leggibile nel file.`;
  }
  return null;
}

export interface EsitoRipristino {
  tabelle: { nome: string; descrizione: string; righe: number }[];
  /** Colonne del file che il database di arrivo non ha (ignorate). */
  colonneIgnorate: string[];
  /** Tabelle del file sconosciute a questa versione (ignorate). */
  tabelleIgnorate: string[];
}

/**
 * Sostituisce la configurazione dello schema con quella del file. Va
 * chiamata DENTRO una transazione: il chiamante fa BEGIN/COMMIT/ROLLBACK.
 */
export async function ripristinaConfigurazione(
  esegui: Esecutore,
  schema: string,
  file: FileConfigurazione
): Promise<EsitoRipristino> {
  const esito: EsitoRipristino = { tabelle: [], colonneIgnorate: [], tabelleIgnorate: [] };
  const note = new Set(TABELLE_CONFIGURAZIONE.map((t) => t.nome));
  for (const nome of Object.keys(file.tabelle))
    if (!note.has(nome)) esito.tabelleIgnorate.push(nome);

  for (const t of TABELLE_CONFIGURAZIONE) {
    const dati = file.tabelle[t.nome];
    if (!dati) continue;
    const colonne = await colonneDi(esegui, schema, t.nome);
    if (colonne.size === 0) {
      esito.tabelleIgnorate.push(t.nome);
      continue;
    }
    await esegui(`DELETE FROM ${q(schema)}.${q(t.nome)}`);
    const ignorate = new Set<string>();
    for (const riga of dati.righe) {
      const chiavi = Object.keys(riga).filter((c) => {
        if (colonne.has(c)) return true;
        ignorate.add(`${t.nome}.${c}`);
        return false;
      });
      if (chiavi.length === 0) continue;
      const valori = chiavi.map((c) => {
        const v = riga[c];
        const tipo = colonne.get(c);
        // jsonb: sempre come testo JSON (un array JS diventerebbe un array
        // Postgres e l'inserimento fallirebbe).
        if ((tipo === 'jsonb' || tipo === 'json') && v !== null && v !== undefined)
          return JSON.stringify(v);
        return v;
      });
      await esegui(
        `INSERT INTO ${q(schema)}.${q(t.nome)} (${chiavi.map(q).join(', ')})
         VALUES (${chiavi.map((_, i) => `$${i + 1}`).join(', ')})`,
        valori
      );
    }
    esito.colonneIgnorate.push(...ignorate);
    // Gli id sono stati conservati: la sequenza riparte dopo il più alto.
    if (colonne.has('id')) {
      await esegui(
        `SELECT setval(seq, COALESCE((SELECT MAX(id) FROM ${q(schema)}.${q(t.nome)}), 1),
                (SELECT MAX(id) FROM ${q(schema)}.${q(t.nome)}) IS NOT NULL)
           FROM (SELECT pg_get_serial_sequence($1, 'id') AS seq) s WHERE seq IS NOT NULL`,
        [`${q(schema)}.${q(t.nome)}`]
      );
    }
    esito.tabelle.push({ nome: t.nome, descrizione: t.descrizione, righe: dati.righe.length });
  }
  return esito;
}
