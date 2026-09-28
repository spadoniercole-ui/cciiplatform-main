// src/lib/debitiEnte/excelDebitiEnte.ts
//
// Posizione Debitoria dell'Ente — esportaDebitiEnteExcel serve alla
// CONSULTAZIONE di quanto già inserito (backup, revisione).
// importaDebitiEnteExcel legge il vecchio formato fisso a 4 colonne.

import * as XLSX from 'xlsx';
import {
  TIPI_DEBITO_ENTE,
  raggruppaPerTipoDebito,
  type TipoDebitoEnte,
  type EtichetteTipoDebitoPersonalizzate,
} from './tipoDebito';
import type { RigaDebitoEnte } from '@/app/actions/debitiEnte';
import { saldoRigaDebitoEnte } from './tipoDebito';

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
  const etichettaColonna = (tipo: string) => etichettePersonalizzate?.[tipo] || tipo;
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
    const saldo = saldoRigaDebitoEnte(r);
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
  /** Colonne mappate al ruolo "extra" (chiave = intestazione originale). null se nessuna. */
  datiExtra: Record<string, string> | null;
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

    righe.push({ voce, importo, importoVersato: null, tipo, note, data: null, datiExtra: null });
  }

  return { righe, righeConErrore };
}
