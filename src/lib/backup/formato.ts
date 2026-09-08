// src/lib/backup/formato.ts
//
// Parti PURE del backup: quotatura, serializzazione dei valori, intestazione
// del file e controllo d'integrità. Stanno qui, fuori da 'use server', per
// poter essere testate — sono il punto in cui un backup si rovina in
// silenzio, e un backup rotto lo si scopre il giorno del ripristino, cioè il
// giorno peggiore.

/** Quota un identificatore (schema, tabella, colonna). */
export function quotaIdentificatore(nome: string): string {
  return `"${nome.replace(/"/g, '""')}"`;
}

/**
 * Serializza un valore come letterale SQL.
 *
 * I casi che contano non sono le stringhe normali ma i tipi che, se
 * appiattiti a testo, tornano indietro diversi da come sono partiti:
 * bytea, array, jsonb, date, numeri non finiti.
 */
/**
 * @param tipo `udt_name` della colonna (es. 'jsonb', '_text', 'int4').
 *
 * Il tipo della COLONNA e non quello del valore, perche' il valore da solo
 * non basta a distinguere i casi. Una colonna `jsonb` che contiene un array
 * JSON viene restituita dal driver come array JavaScript, identica a una
 * colonna `text[]`: serializzarla come `ARRAY[...]` produce un jsonb[] e il
 * ripristino fallisce con
 *   column "..." is of type jsonb but expression is of type jsonb[]
 * Difetto reale, emerso su `spazi.direttrici_ente_strutturate`.
 */
export function serializzaValore(valore: unknown, tipo?: string): string {
  if (valore === null || valore === undefined) return 'NULL';

  if (tipo) {
    // Array Postgres: udt_name comincia con '_' (es. '_text' per text[]).
    if (tipo.startsWith('_')) {
      const elementi = Array.isArray(valore) ? valore : [valore];
      if (elementi.length === 0) return `'{}'`;
      const base = tipo.slice(1);
      return `ARRAY[${elementi.map((v) => serializzaValore(v, base)).join(', ')}]::${base}[]`;
    }
    // JSON: si serializza il valore INTERO come JSON, qualunque forma abbia.
    if (tipo === 'json' || tipo === 'jsonb') {
      return `'${JSON.stringify(valore).replace(/'/g, "''")}'::${tipo}`;
    }
  }

  return serializzaSenzaTipo(valore);
}

/** Ripiego quando il tipo della colonna non e' noto. */
function serializzaSenzaTipo(valore: unknown): string {
  if (valore === null || valore === undefined) return 'NULL';

  if (typeof valore === 'number') {
    // NaN e Infinity non hanno letterale SQL valido per le colonne numeric.
    return Number.isFinite(valore) ? String(valore) : 'NULL';
  }
  if (typeof valore === 'bigint') return String(valore);
  if (typeof valore === 'boolean') return valore ? 'TRUE' : 'FALSE';
  if (valore instanceof Date) return `'${valore.toISOString()}'`;

  // bytea: il driver lo restituisce come Buffer. Senza questo ramo finirebbe
  // stringificato come "[object Object]" o come elenco di byte.
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(valore)) {
    return `'\\x${valore.toString('hex')}'::bytea`;
  }

  // Array Postgres (es. la colonna alias TEXT[] dei limiti di ricevibilità).
  //
  // L'array VUOTO non può essere `ARRAY[]`: Postgres rifiuta con "cannot
  // determine type of empty array", perché senza elementi non ha modo di
  // dedurre il tipo. Si usa il letterale '{}', che assume il tipo della
  // colonna di destinazione. Difetto trovato dal test di ripristino reale:
  // la generazione sembrava corretta finché non si è provato a rieseguirla.
  if (Array.isArray(valore)) {
    if (valore.length === 0) return `'{}'`;
    return `ARRAY[${valore.map((v) => serializzaSenzaTipo(v)).join(', ')}]`;
  }

  if (typeof valore === 'object') {
    return `'${JSON.stringify(valore).replace(/'/g, "''")}'::jsonb`;
  }

  return `'${String(valore).replace(/'/g, "''")}'`;
}

/** Una tabella inventariata nel catalogo, con il suo conteggio righe. */
export interface TabellaInventario {
  schema: string;
  tabella: string;
  righe: number;
}

export interface EsitoIntegrita {
  /** true solo se ogni tabella del catalogo è presente e completa nel backup. */
  integro: boolean;
  /** Tabelle del catalogo che nel backup non hanno alcun CREATE TABLE. */
  tabelleMancanti: string[];
  /** Tabelle in cui le righe scritte non corrispondono a quelle lette. */
  righeIncoerenti: { tabella: string; attese: number; scritte: number }[];
}

/**
 * Confronta l'inventario letto dal catalogo con ciò che è stato davvero
 * scritto nel backup.
 *
 * È il controllo che distingue un backup da una promessa: un dump troncato a
 * metà, o una tabella saltata per un errore silenzioso, hanno esattamente
 * l'aspetto di un backup riuscito finché non si prova a ripristinarli.
 */
export function verificaIntegrita(
  inventario: TabellaInventario[],
  scritte: Map<string, number>,
  tabelleConDdl: Set<string>
): EsitoIntegrita {
  const tabelleMancanti: string[] = [];
  const righeIncoerenti: { tabella: string; attese: number; scritte: number }[] = [];

  for (const t of inventario) {
    const chiave = `${t.schema}.${t.tabella}`;
    if (!tabelleConDdl.has(chiave)) {
      tabelleMancanti.push(chiave);
      continue;
    }
    const n = scritte.get(chiave) ?? 0;
    if (n !== t.righe) {
      righeIncoerenti.push({ tabella: chiave, attese: t.righe, scritte: n });
    }
  }

  return {
    integro: tabelleMancanti.length === 0 && righeIncoerenti.length === 0,
    tabelleMancanti,
    righeIncoerenti,
  };
}

export interface DatiIntestazione {
  versioneApp: string;
  generatoIl: string;
  schemi: number;
  tabelle: number;
  righe: number;
  cifrato: boolean;
}

/**
 * Intestazione leggibile in cima al file. Serve a chi fra due anni troverà
 * un .sql su una chiavetta e dovrà capire cos'è e come si rimette dentro.
 */
export function intestazione(d: DatiIntestazione): string {
  return [
    '-- ============================================================',
    '-- CCIIPlatform — BACKUP COMPLETO DEL DATABASE',
    `-- Versione applicazione: ${d.versioneApp}`,
    `-- Generato il: ${d.generatoIl}`,
    `-- Schemi: ${d.schemi} · Tabelle: ${d.tabelle} · Righe: ${d.righe}`,
    '--',
    '-- Contiene schema, dati e valori correnti delle sequenze: sufficiente a',
    '-- ricostruire il database da zero SENZA il codice applicativo.',
    '--',
    '-- RIPRISTINO: su un database VUOTO,',
    '--   psql "<stringa-di-connessione>" -f questo-file.sql',
    '--',
    '-- ATTENZIONE: contiene le credenziali (hash delle password, segreti TOTP,',
    '-- hash dei PIN, sessioni). Va custodito come si custodisce una password.',
    d.cifrato
      ? '-- Questo file è stato generato in forma CIFRATA (AES-256-GCM).'
      : '-- Questo file NON è cifrato.',
    '-- ============================================================',
    '',
  ].join('\n');
}

/** Nome file suggerito: ordinabile per data, senza caratteri problematici. */
export function nomeFileBackup(versione: string, quando: Date, cifrato: boolean): string {
  const t = quando.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `ccii-backup-${versione}-${t}.sql${cifrato ? '.enc' : ''}`;
}
