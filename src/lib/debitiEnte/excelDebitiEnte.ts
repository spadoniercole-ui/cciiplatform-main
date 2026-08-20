// src/lib/debitiEnte/excelDebitiEnte.ts
//
// Posizione Debitoria dell'Ente — a differenza di ogni altro Excel del
// progetto, qui NON esportiamo un modello da compilare e reimportare: il
// sistema assorbe la struttura del PRIMO file che l'ente carica (quello
// che già usa nella propria contabilità) e la fissa come architrave per
// i caricamenti successivi (src/app/actions/debitiEnteArchitrave.ts).
// esportaDebitiEnteExcel resta solo per la CONSULTAZIONE di quanto già
// inserito (backup, revisione) — non è più pensato per essere
// ricaricato. importaDebitiEnteExcel (il vecchio formato fisso a 4
// colonne) resta per compatibilità con dati inseriti prima di questa
// consegna; il percorso nuovo, per tutto il resto, è
// leggiIntestazioniExcel + importaConArchitrave qui sotto.

import * as XLSX from 'xlsx';
import {
  TIPI_DEBITO_ENTE,
  raggruppaPerTipoDebito,
  type TipoDebitoEnte,
  type EtichetteTipoDebitoPersonalizzate,
} from './tipoDebito';
import type { RigaDebitoEnte } from '@/app/actions/debitiEnte';

const INTESTAZIONI = ['Voce', 'Importo (€)', 'Tipo (CLE / CEN / CEC / CEA)', 'Note'];

const PAROLE_RIEPILOGO = ['totale', 'riepilogo', 'somma', 'subtotale', 'totali'];

function sembraRigaDiRiepilogo(voce: string): boolean {
  const pulito = voce.trim().toLowerCase();
  return PAROLE_RIEPILOGO.some((parola) => pulito === parola || pulito.startsWith(parola + ' '));
}

function nomeFileSicuro(testo: string): string {
  return (testo || 'debiti_ente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function esportaDebitiEnteExcel(
  nomeScenario: string,
  righe: RigaDebitoEnte[],
  etichettePersonalizzate?: EtichetteTipoDebitoPersonalizzate
): void {
  const etichettaColonna = (tipo: TipoDebitoEnte) => etichettePersonalizzate?.[tipo] || tipo;
  const intestazioniConSaldo = [
    'Voce',
    'Importo (€)',
    'Versato (€)',
    'Saldo (€)',
    'Tipo (CLE / CEN / CEC / CEA)',
    'Note',
    'Data',
  ];
  const dati: (string | number)[][] = [
    [
      `Compilare una riga per ogni voce di debito. Non modificare le intestazioni. Tipo: scrivere esattamente ${TIPI_DEBITO_ENTE.map((t) => etichettaColonna(t.valore)).join(', ')} (vedi legenda: Certo Liquido Esigibile / Certo Emesso Notificato / Certo Esigibile Contenzioso / Certo Esigibile Agente Riscossione).`,
    ],
    intestazioniConSaldo,
  ];

  for (const r of righe) {
    const versato = r.importoVersato ?? '';
    const saldo = r.importoVersato === null ? r.importo : r.importo - r.importoVersato;
    dati.push([
      r.voce,
      r.importo,
      versato,
      saldo,
      etichettaColonna(r.tipo),
      r.note || '',
      r.data || '',
    ]);
  }
  if (righe.length === 0) {
    for (let i = 0; i < 10; i++) dati.push(['', '', '', '', '', '', '']);
  }

  // Totale per tipo in fondo alle righe — di sola lettura: una riga
  // "Totale" per ciascun tipo, riconosciuta e scartata se il file viene
  // reimportato (stessa protezione già in uso per la Proposta).
  dati.push(['', '', '', '', '', '', '']);
  const riepilogo = raggruppaPerTipoDebito(righe, etichettePersonalizzate);
  for (const r of riepilogo) {
    if (r.numeroRighe === 0) continue;
    dati.push([
      `Totale ${r.etichetta}`,
      r.totale,
      '',
      r.totaleSaldo,
      '',
      `${r.numeroRighe} voci`,
      '',
    ]);
  }
  const totaleComplessivo = riepilogo.reduce((acc, r) => acc + r.totale, 0);
  const totaleSaldoComplessivo = riepilogo.reduce((acc, r) => acc + r.totaleSaldo, 0);
  dati.push(['Totale complessivo', totaleComplessivo, '', totaleSaldoComplessivo, '', '', '']);

  const foglio = XLSX.utils.aoa_to_sheet(dati);
  foglio['!cols'] = [
    { wch: 35 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 30 },
    { wch: 12 },
  ];
  foglio['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglio, 'Posizione Debitoria Ente');
  XLSX.writeFile(wb, `debiti_ente_${nomeFileSicuro(nomeScenario)}.xlsx`);
}

export interface RigaDebitoEsportabile {
  voce: string;
  importo: number;
  importoVersato: number | null;
  tipo: TipoDebitoEnte;
  note: string | null;
  data: string | null;
}

export interface RisultatoParsingDebitiEnte {
  righe: RigaDebitoEsportabile[];
  righeConErrore: { indice: number; motivo: string }[];
}

function interpretaTipo(
  testo: unknown,
  etichettePersonalizzate?: EtichetteTipoDebitoPersonalizzate
): TipoDebitoEnte | null {
  if (typeof testo !== 'string') return null;
  const pulito = testo.trim().toUpperCase();
  // Prima il codice fisso (CLE/CEN/CEC/CEA), poi l'etichetta
  // personalizzata di questo spazio (es. "7780" per CEA) — un ente può
  // aver esportato il modello con la propria etichetta, il reimport deve
  // riconoscerla.
  const trovatoPerCodice = TIPI_DEBITO_ENTE.find((t) => t.valore === pulito);
  if (trovatoPerCodice) return trovatoPerCodice.valore;
  if (etichettePersonalizzate) {
    const trovatoPerEtichetta = TIPI_DEBITO_ENTE.find(
      (t) => (etichettePersonalizzate[t.valore] || '').trim().toUpperCase() === pulito
    );
    if (trovatoPerEtichetta) return trovatoPerEtichetta.valore;
  }
  return null;
}

export async function importaDebitiEnteExcel(
  file: File,
  etichettePersonalizzate?: EtichetteTipoDebitoPersonalizzate
): Promise<RisultatoParsingDebitiEnte> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const foglio = wb.Sheets[wb.SheetNames[0]];

  const righe: RigaDebitoEsportabile[] = [];
  const righeConErrore: { indice: number; motivo: string }[] = [];

  const intervallo = XLSX.utils.decode_range(foglio['!ref'] || 'A1');
  const cella = (riga: number, colonna: number) =>
    foglio[XLSX.utils.encode_cell({ r: riga, c: colonna })];

  for (let r = intervallo.s.r; r <= intervallo.e.r; r++) {
    const cellaVoce = cella(r, 0);
    const voce = typeof cellaVoce?.v === 'string' ? cellaVoce.v.trim() : '';
    if (!voce || voce === INTESTAZIONI[0]) continue; // riga vuota o intestazione
    if (sembraRigaDiRiepilogo(voce)) continue; // "Totale ..." — riga di riepilogo aggiunta dall'export, non un debito

    const colonneSuccessive = [1, 2, 3].map((c) => cella(r, c)?.v);
    if (colonneSuccessive.every((v) => v === undefined || v === '')) continue; // riga di istruzioni

    const importo = Number(cella(r, 1)?.v);
    const tipo = interpretaTipo(cella(r, 2)?.v, etichettePersonalizzate);
    const noteGrezze = cella(r, 3)?.v;
    const note = typeof noteGrezze === 'string' && noteGrezze.trim() ? noteGrezze.trim() : null;

    if (Number.isNaN(importo) || importo < 0) {
      righeConErrore.push({ indice: r, motivo: `"${voce}": importo non valido` });
      continue;
    }
    if (!tipo) {
      righeConErrore.push({
        indice: r,
        motivo: `"${voce}": tipo non riconosciuto (scrivere CLE, CEN, CEC o CEA)`,
      });
      continue;
    }

    righe.push({ voce, importo, importoVersato: null, tipo, note, data: null });
  }

  return { righe, righeConErrore };
}

// ============================================================================
// Flusso adattivo — il file che l'ente porta con il proprio formato,
// non un nostro modello. Due fasi: (1) leggere solo le intestazioni, per
// far scegliere all'operatore cosa significa ciascuna colonna (una volta
// sola, al primo caricamento); (2) importare usando quella mappatura,
// salvata come architrave, per ogni caricamento successivo.
// ============================================================================

export interface IntestazioniLette {
  intestazioni: string[];
  /** Valori distinti trovati nella prima colonna che sembra testuale e ripetuta (candidata a "tipo") — aiuta l'operatore a mappare i valori del proprio file su CLE/CEN/CEC/CEA senza doverli indovinare. */
  valoriDistintiPerColonna: string[][];
  numeroRigheDati: number;
  /** Tutti i fogli del file, non solo quello letto — molti export (es. INPS) hanno un foglio di riepilogo e altri di dettaglio: l'operatore sceglie quale leggere, non si assume mai il primo. */
  fogliDisponibili: string[];
  foglioLetto: string;
}

/** Legge solo le intestazioni (riga 0) e i valori distinti per colonna, senza interpretare nulla — la mappatura la sceglie l'operatore. Se nomeFoglio non è indicato, legge il primo — ma lo dichiara sempre in foglioLetto, così l'operatore vede subito se non è quello giusto. */
export async function leggiIntestazioniExcel(
  file: File,
  nomeFoglio?: string
): Promise<IntestazioniLette> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const foglioScelto =
    nomeFoglio && wb.SheetNames.includes(nomeFoglio) ? nomeFoglio : wb.SheetNames[0];
  const foglio = wb.Sheets[foglioScelto];
  const intervallo = XLSX.utils.decode_range(foglio['!ref'] || 'A1');
  const cella = (riga: number, colonna: number) =>
    foglio[XLSX.utils.encode_cell({ r: riga, c: colonna })];

  const numeroColonne = intervallo.e.c - intervallo.s.c + 1;
  const intestazioni: string[] = [];
  for (let c = 0; c < numeroColonne; c++) {
    const valore = cella(0, c)?.v;
    intestazioni.push(
      typeof valore === 'string' ? valore.trim() : String(valore ?? `Colonna ${c + 1}`)
    );
  }

  // Una riga "ha dati" se QUALUNQUE colonna è valorizzata — non solo la
  // prima. Guardare sempre la colonna 0 fissa, a prescindere da quale
  // ruolo ci sia mappato, scartava in silenzio metà delle righe di
  // schemi proprietari dove la prima colonna non è sempre popolata.
  const rigaHaDati = (r: number): boolean => {
    for (let c = 0; c < numeroColonne; c++) {
      const v = cella(r, c)?.v;
      if (v !== undefined && v !== '') return true;
    }
    return false;
  };

  const valoriDistintiPerColonna: string[][] = intestazioni.map(() => []);
  let numeroRigheDati = 0;
  for (let r = 1; r <= intervallo.e.r; r++) {
    if (!rigaHaDati(r)) continue;
    numeroRigheDati += 1;
    for (let c = 0; c < numeroColonne; c++) {
      const valore = cella(r, c)?.v;
      const testo = typeof valore === 'string' ? valore.trim() : String(valore ?? '');
      if (
        testo &&
        !valoriDistintiPerColonna[c].includes(testo) &&
        valoriDistintiPerColonna[c].length < 20
      ) {
        valoriDistintiPerColonna[c].push(testo);
      }
    }
  }

  return {
    intestazioni,
    valoriDistintiPerColonna,
    numeroRigheDati,
    fogliDisponibili: wb.SheetNames,
    foglioLetto: foglioScelto,
  };
}

export interface RisultatoImportConArchitrave {
  righe: RigaDebitoEsportabile[];
  righeConErrore: { indice: number; motivo: string }[];
  /** true se il numero di colonne del file non coincide con l'architrave salvato — l'operatore ha caricato un file diverso da quello atteso. */
  strutturaNonCorrispondente: boolean;
}

/** Un numero seriale Excel (giorni dal 1899-12-30) o una stringa in formato italiano/ISO — entrambi ammessi, lo schema proprietario può usare l'uno o l'altro a seconda di come la colonna è formattata nel file sorgente. */
function parsaData(valore: unknown): string | null {
  if (valore === undefined || valore === null || valore === '') return null;
  if (typeof valore === 'number') {
    const data = XLSX.SSF.parse_date_code(valore);
    if (!data) return null;
    return `${data.y}-${String(data.m).padStart(2, '0')}-${String(data.d).padStart(2, '0')}`;
  }
  const testo = String(valore).trim();
  const isoMatch = testo.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const itMatch = testo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (itMatch) return `${itMatch[3]}-${itMatch[2].padStart(2, '0')}-${itMatch[1].padStart(2, '0')}`;
  return null;
}

function parsaImporto(valore: unknown): number | null {
  if (valore === undefined || valore === null || valore === '') return null;
  const numero =
    typeof valore === 'number'
      ? valore
      : Number(String(valore).replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(numero) ? null : numero;
}

/** Importa usando la mappatura già scelta (architrave) — nessuna interpretazione nuova, solo applicazione di quanto deciso al primo caricamento. */
export async function importaConArchitrave(
  file: File,
  mappatura: string[], // RuoloColonnaDebito[], tipizzato lato chiamante
  mappaturaTipo: Record<string, TipoDebitoEnte>,
  numeroColonneAttese: number,
  nomeFoglio?: string | null,
  tipoFisso?: TipoDebitoEnte | null
): Promise<RisultatoImportConArchitrave> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const foglioScelto =
    nomeFoglio && wb.SheetNames.includes(nomeFoglio) ? nomeFoglio : wb.SheetNames[0];
  const foglio = wb.Sheets[foglioScelto];
  const intervallo = XLSX.utils.decode_range(foglio['!ref'] || 'A1');
  const cella = (riga: number, colonna: number) =>
    foglio[XLSX.utils.encode_cell({ r: riga, c: colonna })];

  const numeroColonne = intervallo.e.c - intervallo.s.c + 1;
  if (numeroColonne !== numeroColonneAttese) {
    return { righe: [], righeConErrore: [], strutturaNonCorrispondente: true };
  }

  const idxVoce = mappatura.indexOf('voce');
  const idxImporto = mappatura.indexOf('importo');
  const idxImportoVersato = mappatura.indexOf('importo_versato');
  const idxTipo = mappatura.indexOf('tipo');
  const idxNota = mappatura.indexOf('nota');
  const idxData = mappatura.indexOf('data');

  // Stessa correzione di leggiIntestazioniExcel — vedi lì il commento.
  const rigaHaDati = (r: number): boolean => {
    for (let c = 0; c < numeroColonne; c++) {
      const v = cella(r, c)?.v;
      if (v !== undefined && v !== '') return true;
    }
    return false;
  };

  const righe: RigaDebitoEsportabile[] = [];
  const righeConErrore: { indice: number; motivo: string }[] = [];

  for (let r = 1; r <= intervallo.e.r; r++) {
    if (!rigaHaDati(r)) continue;

    const voce =
      idxVoce >= 0 ? String(cella(r, idxVoce)?.v ?? '').trim() : `Riga ${righe.length + 1}`;
    const importo = parsaImporto(cella(r, idxImporto)?.v);
    const importoVersato =
      idxImportoVersato >= 0 ? parsaImporto(cella(r, idxImportoVersato)?.v) : null;
    const testoTipo = String(cella(r, idxTipo)?.v ?? '').trim();
    // File come un export INPS: nessuna colonna dedicata al tipo, tutte
    // le righe sono implicitamente della stessa natura — un tipo fisso
    // per l'intero import, non una mappatura per valore.
    const tipo = tipoFisso ?? mappaturaTipo[testoTipo];
    const noteGrezze = idxNota >= 0 ? cella(r, idxNota)?.v : undefined;
    const note = typeof noteGrezze === 'string' && noteGrezze.trim() ? noteGrezze.trim() : null;
    const data = idxData >= 0 ? parsaData(cella(r, idxData)?.v) : null;

    if (importo === null || importo < 0) {
      righeConErrore.push({ indice: r, motivo: `"${voce}": importo non valido` });
      continue;
    }
    if (!tipo) {
      righeConErrore.push({
        indice: r,
        motivo: `"${voce}": valore "${testoTipo}" nella colonna Tipo non è mai stato mappato — aggiorna il modello o correggi il file.`,
      });
      continue;
    }

    righe.push({ voce, importo, importoVersato, tipo, note, data });
  }

  return { righe, righeConErrore, strutturaNonCorrispondente: false };
}
