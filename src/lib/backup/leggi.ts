// src/lib/backup/leggi.ts
//
// Lettura e VALIDAZIONE di un file di backup, prima che tocchi qualcosa.
//
// Il ripristino è l'operazione più distruttiva della piattaforma: cancella
// tutto e riscrive. L'unica cosa che la rende accettabile è l'ordine in cui
// avvengono i passi — si valida prima e si cancella dopo, mai il contrario.
// Questo file è il "prima": tutto ciò che si può sapere di un backup senza
// rischiare nulla.
//
// Funzioni PURE: nessun database, nessun filesystem.

/** Intestazione dichiarata dal file, come è stata scritta al momento del backup. */
export interface IntestazioneBackup {
  versioneApp: string | null;
  generatoIl: string | null;
  schemi: number | null;
  tabelle: number | null;
  righe: number | null;
}

export interface EsitoLettura {
  valido: boolean;
  /** Perché non è valido. Vuoto se lo è. */
  problemi: string[];
  intestazione?: IntestazioneBackup;
  /** Conteggio delle istruzioni realmente presenti nello script. */
  conteggi?: {
    createSchema: number;
    createTable: number;
    insert: number;
    vincoli: number;
    indici: number;
    setval: number;
  };
}

/** Un file cifrato è base64 puro; uno in chiaro comincia con i trattini del commento SQL. */
export function sembraCifrato(contenuto: string): boolean {
  const t = contenuto.trimStart();
  if (t.startsWith('--') || t.startsWith('BEGIN;')) return false;
  // base64: solo caratteri dell'alfabeto, e abbastanza lungo da non essere
  // un file di poche righe scritto a mano.
  return /^[A-Za-z0-9+/=\s]+$/.test(t.slice(0, 2000)) && t.length > 100;
}

function numeroDa(testo: string, etichetta: string): number | null {
  const m = testo.match(new RegExp(`${etichetta}:\\s*([\\d.]+)`, 'i'));
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Legge un backup in chiaro e ne verifica la plausibilità.
 *
 * Non pretende di garantire che lo script gira: quello lo dice solo
 * l'esecuzione, ed è il passo successivo. Qui si intercettano i casi in cui
 * è inutile andare oltre — file troncato, file sbagliato, decifratura
 * riuscita solo in apparenza.
 */
export function leggiBackup(contenuto: string): EsitoLettura {
  const problemi: string[] = [];

  if (!contenuto || contenuto.trim().length === 0) {
    return { valido: false, problemi: ['Il file è vuoto.'] };
  }

  // Firma: ogni backup nasce con questa intestazione. Se manca, o il file non
  // è un nostro backup, o la passphrase era sbagliata e ciò che si ha in mano
  // è rumore che somiglia a testo.
  if (!contenuto.includes('CCIIPlatform — BACKUP COMPLETO DEL DATABASE')) {
    problemi.push(
      'Il file non è riconosciuto come un backup di CCIIPlatform. Se era cifrato, la passphrase potrebbe essere errata.'
    );
    return { valido: false, problemi };
  }

  const testa = contenuto.slice(0, 2000);
  const intestazione: IntestazioneBackup = {
    versioneApp: testa.match(/Versione applicazione:\s*(\S+)/)?.[1] ?? null,
    generatoIl: testa.match(/Generato il:\s*(\S+)/)?.[1] ?? null,
    schemi: numeroDa(testa, 'Schemi'),
    tabelle: numeroDa(testa, 'Tabelle'),
    righe: numeroDa(testa, 'Righe'),
  };

  const conta = (re: RegExp) => (contenuto.match(re) ?? []).length;
  const conteggi = {
    createSchema: conta(/^CREATE SCHEMA/gm),
    createTable: conta(/^CREATE TABLE/gm),
    insert: conta(/^INSERT INTO/gm),
    vincoli: conta(/^ALTER TABLE .* ADD CONSTRAINT/gm),
    indici: conta(/^CREATE (UNIQUE )?INDEX/gm),
    setval: conta(/^SELECT setval/gm),
  };

  // Troncamento: è il guasto peggiore, perché il file ha tutta l'aria di
  // essere a posto. Un backup completo finisce sempre con COMMIT.
  if (!/COMMIT;\s*$/.test(contenuto.trimEnd())) {
    problemi.push(
      'Il file non termina con COMMIT: è troncato. Un ripristino parziale lascerebbe il database a metà.'
    );
  }
  if (!contenuto.includes('BEGIN;')) {
    problemi.push('Manca l’apertura della transazione (BEGIN).');
  }

  if (conteggi.createTable === 0) {
    problemi.push('Nessuna tabella nel file: non è un backup completo.');
  }

  // Coerenza con ciò che il file stesso dichiara nella propria intestazione.
  if (intestazione.tabelle !== null && conteggi.createTable !== intestazione.tabelle) {
    problemi.push(
      `L’intestazione dichiara ${intestazione.tabelle} tabelle ma nel file ce ne sono ${conteggi.createTable}.`
    );
  }
  if (intestazione.righe !== null && conteggi.insert !== intestazione.righe) {
    problemi.push(
      `L’intestazione dichiara ${intestazione.righe} righe ma nel file ci sono ${conteggi.insert} INSERT.`
    );
  }

  return { valido: problemi.length === 0, problemi, intestazione, conteggi };
}
