// Cuore del lettore "consapevole di sezioni" per i tracciati della
// Posizione Debitoria dell'Ente. LOGICA PURA, senza dipendenze da XLSX o
// dal browser: opera su una matrice di celle (AOA — array di array) già
// estratta da un foglio. La conversione file→AOA vive in tracciatoExcel.ts.
//
// Perché puro: così la logica di riconoscimento header, colonne sfalsate e
// salto di sezione è testabile in isolamento (e infatti è collaudata sui
// due file reali INPS: nrc_*.xlsx e DettaglioRichiesta_*.xls).

export type CellaGrezza = string | number | boolean | Date | null | undefined;
export type Aoa = CellaGrezza[][];

/** Una cella è "vuota" se null/undefined o stringa di soli spazi. 0 NON è vuoto. */
export function cellaVuota(c: CellaGrezza): boolean {
  if (c === null || c === undefined) return true;
  if (typeof c === 'string') return c.trim() === '';
  return false;
}

/** Testo di una cella, robusto a numeri/date/null. Le date in ISO breve (yyyy-mm-dd). */
export function testoCella(c: CellaGrezza): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) {
    // Solo la parte data: gli export INPS non portano orari significativi.
    const y = c.getFullYear();
    const m = String(c.getMonth() + 1).padStart(2, '0');
    const d = String(c.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof c === 'number') return String(c);
  if (typeof c === 'boolean') return c ? 'true' : 'false';
  return c.trim();
}

/**
 * Normalizzazione robusta di un'etichetta di colonna per la FIRMA e il
 * riconoscimento: minuscole, senza accenti, senza caratteri sporchi di
 * codifica (mojibake tipo "ï¿½"), spazi collassati. Due header che
 * differiscono solo per queste sporcizie risultano uguali.
 */
export function normalizzaEtichetta(s: CellaGrezza): string {
  return testoCella(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accenti
    .replace(/[^a-z0-9]+/gi, ' ') // tutto ciò che non è alfanumerico → spazio (include mojibake)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Indici delle colonne "reali" (non vuote) di una riga — salta gli spaziatori. */
export function colonneRealiDaRiga(riga: CellaGrezza[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < riga.length; i++) if (!cellaVuota(riga[i])) out.push(i);
  return out;
}

function pareNumero(c: CellaGrezza): boolean {
  if (typeof c === 'number') return true;
  if (typeof c === 'string') {
    const t = c.trim().replace(',', '.');
    return t !== '' && !Number.isNaN(Number(t));
  }
  return false;
}

/**
 * Individua la riga di header con un'euristica: la prima riga con almeno 3
 * celle non vuote in prevalenza testuali (etichette, non numeri), seguita da
 * una riga che porta dati nelle stesse colonne. Per l'nrc è la riga 0; per il
 * DettaglioRichiesta (foglio "Dettaglio Verifica") salta la riga vuota e il
 * titolo di sezione e trova la vera intestazione.
 */
export function trovaRigaHeader(aoa: Aoa, maxScan = 30): number {
  const limite = Math.min(aoa.length, maxScan);
  for (let r = 0; r < limite; r++) {
    const riga = aoa[r] || [];
    const nonVuote = colonneRealiDaRiga(riga);
    if (nonVuote.length < 3) continue;
    const testuali = nonVuote.filter((i) => !pareNumero(riga[i]));
    if (testuali.length < 3) continue;
    // La riga successiva deve portare dati che si sovrappongono ad almeno 2
    // delle colonne dell'header (evita di scambiare un titolo per header).
    const succ = aoa[r + 1] || [];
    const nonVuoteSucc = new Set(colonneRealiDaRiga(succ));
    const sovrapposte = nonVuote.filter((i) => nonVuoteSucc.has(i));
    if (sovrapposte.length >= 2) return r;
  }
  return -1;
}

/**
 * Individua la riga di header confrontando le etichette normalizzate con
 * quelle salvate nel tracciato: robusto a piccoli slittamenti di riga tra un
 * export e l'altro. Ritorna -1 se nessuna riga combacia.
 */
export function trovaRigaHeaderPerEtichette(
  aoa: Aoa,
  etichetteAtteseNormalizzate: string[],
  maxScan = 40
): number {
  const attese = etichetteAtteseNormalizzate.filter((e) => e !== '');
  if (attese.length === 0) return -1;
  const limite = Math.min(aoa.length, maxScan);
  for (let r = 0; r < limite; r++) {
    const riga = aoa[r] || [];
    const etichetteRiga = colonneRealiDaRiga(riga).map((i) => normalizzaEtichetta(riga[i]));
    // Tutte le etichette attese devono comparire nella riga (in ordine di
    // colonne reali); tollerante a colonne extra vuote ma non a colonne
    // mancanti.
    const combacia =
      etichetteRiga.length >= attese.length && attese.every((e, k) => etichetteRiga[k] === e);
    if (combacia) return r;
  }
  return -1;
}

/** True se la riga segna un SALTO DI SEZIONE (fine dei debiti utili). */
export function rigaSaltoSezione(riga: CellaGrezza[], colonneReali: number[]): boolean {
  const nonVuote = colonneRealiDaRiga(riga);
  // Riga completamente vuota.
  if (nonVuote.length === 0) return true;
  // Solo la prima colonna reale valorizzata → titolo/sezione.
  const primaReale = colonneReali[0] ?? 0;
  if (nonVuote.length === 1 && nonVuote[0] === primaReale) return true;
  // Riga-totale: la prima colonna reale inizia con "totale".
  const testoPrima = normalizzaEtichetta(riga[primaReale]);
  if (testoPrima.startsWith('totale')) return true;
  return false;
}

export interface SezioneEstratta {
  /** Indice (0-based) della riga di header individuata. -1 se non trovata. */
  headerRow: number;
  /** Etichette originali (testo) delle colonne reali, in ordine. */
  intestazioni: string[];
  /** Posizioni (0-based) delle colonne reali nel foglio — salta gli spaziatori. */
  colonneReali: number[];
  /** Righe dati della prima sezione utile, ciascuna già ridotta alle sole colonne reali. */
  righe: CellaGrezza[][];
  /** Indice della riga dove la sezione si è fermata (il salto), o fine foglio. */
  fermatoARiga: number;
}

/**
 * Estrae la PRIMA sezione utile: dall'header individuato fino al primo salto
 * di sezione. `headerRowForzata` permette di imporre la riga header (percorso
 * "tracciato già noto"); se < 0 si usa l'euristica.
 */
export function estraiSezione(aoa: Aoa, headerRowForzata = -1): SezioneEstratta {
  const headerRow = headerRowForzata >= 0 ? headerRowForzata : trovaRigaHeader(aoa);
  if (headerRow < 0) {
    return { headerRow: -1, intestazioni: [], colonneReali: [], righe: [], fermatoARiga: -1 };
  }
  const rigaHeader = aoa[headerRow] || [];
  const colonneReali = colonneRealiDaRiga(rigaHeader);
  const intestazioni = colonneReali.map((i) => testoCella(rigaHeader[i]));

  const righe: CellaGrezza[][] = [];
  let fermatoARiga = aoa.length;
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const riga = aoa[r] || [];
    if (rigaSaltoSezione(riga, colonneReali)) {
      fermatoARiga = r;
      break;
    }
    righe.push(colonneReali.map((i) => riga[i] ?? null));
  }
  return { headerRow, intestazioni, colonneReali, righe, fermatoARiga };
}

export interface SezioneConTitolo extends SezioneEstratta {
  /** Titolo della sezione (la riga a sola prima colonna che la precede). */
  titolo: string;
}

/**
 * Estrae TUTTE le sezioni-dati di un foglio (per il file VERA): ogni sezione è
 * un blocco «titolo → header → righe fino al salto». Salta il rumore (righe
 * "SEZIONE F24", "Non riscontrate irregolarità", "Totale gestione:") che non è
 * seguito da un header vero. Ogni sezione porta il suo titolo, con cui poi si
 * attribuisce la natura (Debito/AVA/Neutro).
 */
export function estraiTutteLeSezioni(aoa: Aoa): SezioneConTitolo[] {
  const out: SezioneConTitolo[] = [];
  let r = 0;
  let ultimoTitolo = '';
  while (r < aoa.length) {
    const row = aoa[r] || [];
    const ne = colonneRealiDaRiga(row);
    // Candidata a TITOLO: una sola colonna reale, testuale, non "totale…".
    if (ne.length === 1) {
      const txt = testoCella(row[ne[0]]);
      if (txt && !normalizzaEtichetta(txt).startsWith('totale')) ultimoTitolo = txt;
      r++;
      continue;
    }
    // Candidata a HEADER: ≥3 colonne, in prevalenza testuali, con dati sotto.
    if (ne.length >= 3) {
      const testuali = ne.filter((i) => !pareNumero(row[i]));
      const succ = aoa[r + 1] || [];
      const succSet = new Set(colonneRealiDaRiga(succ));
      const overlap = ne.filter((i) => succSet.has(i));
      if (testuali.length >= 3 && overlap.length >= 2) {
        const sez = estraiSezione(aoa, r);
        out.push({ titolo: ultimoTitolo || `Sezione ${out.length + 1}`, ...sez });
        ultimoTitolo = '';
        r = sez.fermatoARiga;
        continue;
      }
    }
    r++;
  }
  return out;
}

/** Valori distinti (testo, non vuoti) di una colonna reale entro le righe della sezione. */
export function valoriDistintiColonna(
  righe: CellaGrezza[][],
  indiceColonnaReale: number
): string[] {
  const visti = new Set<string>();
  const out: string[] = [];
  for (const riga of righe) {
    const v = testoCella(riga[indiceColonnaReale]);
    if (v !== '' && !visti.has(v)) {
      visti.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * Firma normalizzata del tracciato: fogli (come insieme ordinato) + etichette
 * header (in ordine di colonna). Serve al riconoscimento robusto.
 */
export function calcolaFirma(nomiFogli: string[], intestazioni: string[]): string {
  const fogli = [...nomiFogli.map((f) => normalizzaEtichetta(f))].sort();
  const header = intestazioni.map((h) => normalizzaEtichetta(h));
  return JSON.stringify({ fogli, header });
}

// ---------------------------------------------------------------------------
// Tipi condivisi del tracciato (client + server).
// ---------------------------------------------------------------------------

/** Ruolo attribuito a una colonna reale. 'guida' = colonna-guida coi codici da classificare (obbligatoria e non ignorabile quando il modo è colonna_guida). */
export type RuoloColonna =
  'voce' | 'importo' | 'importo_versato' | 'data' | 'nota' | 'extra' | 'ignora' | 'guida';

export type ClassificazioneModo = 'colonna_guida' | 'tipo_fisso';

export interface Tracciato {
  id: number;
  /** Nome scelto dall'operatore (es. "NRC INPS"). */
  nome: string;
  /** Foglio da leggere (nome esatto). */
  foglio: string;
  /** Etichette originali delle colonne reali, in ordine. */
  intestazioni: string[];
  /** Ruolo per ciascuna colonna reale (stessa lunghezza di intestazioni). */
  ruoli: RuoloColonna[];
  classificazioneModo: ClassificazioneModo;
  /** Codice categoria unico, quando modo = tipo_fisso. */
  tipoFisso: string | null;
  /** Valore della colonna-guida → codice categoria, quando modo = colonna_guida. */
  mappaturaCodici: Record<string, string>;
  /** Insieme dei codici-guida già visti (per rilevare i nuovi ad ogni caricamento). */
  codiciNoti: string[];
  nomeFileOrigine: string | null;
}

/** Indice (tra le colonne reali) della colonna con ruolo dato; -1 se assente. */
export function indiceRuolo(ruoli: RuoloColonna[], ruolo: RuoloColonna): number {
  return ruoli.indexOf(ruolo);
}
