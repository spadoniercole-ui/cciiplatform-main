// src/lib/proposta/excelProposta.ts
//
// Export/import Excel della Proposta in entrata: intestazioni fisse
// decise dal sistema, righe da 1 a N (scalabile), per evitare di dover
// inserire 20-30 righe una alla volta nell'interfaccia. Nessuno schema
// esterno standard trovato in rete per questo caso — tracciato nostro,
// che ricalca esattamente i campi già gestiti dalla Proposta.

import * as XLSX from 'xlsx';
import { RANGHI_LEGALI, etichettaRango, type RangoLegale } from './rangoLegale';

const INTESTAZIONI = [
  'Categoria creditore',
  'Importo dovuto (€)',
  '% offerta',
  'Modalità (Unica soluzione / Rateale)',
  'Numero rate (solo se Rateale)',
  'Rango legale',
  'Note',
];

function nomeFileSicuro(testo: string): string {
  return (testo || 'proposta')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export interface RigaPropostaEsportabile {
  categoriaCreditore: string;
  importoDovuto: number;
  percentualeOfferta: number;
  modalita: 'UNICA_SOLUZIONE' | 'RATEALE';
  numeroRate: number | null;
  note: string | null;
  rangoLegale?: RangoLegale | null;
}

/** Esporta un modello (vuoto o già con righe, per completarlo) — 1 a N righe, scalabile. */
export function esportaPropostaExcel(nomeScenario: string, righe: RigaPropostaEsportabile[]): void {
  const dati: (string | number)[][] = [
    [
      'Compilare una riga per ogni categoria di creditore. Non modificare le intestazioni. Modalità: scrivere esattamente "Unica soluzione" o "Rateale". Numero rate solo se Rateale. Rango legale: Prededucibile / Privilegiato — assistito da ipoteca / Privilegiato — privilegio generale / Privilegiato — non specificato / Chirografario / Postergato (lasciare vuoto se non classificato).',
    ],
    INTESTAZIONI,
  ];

  for (const r of righe) {
    dati.push([
      r.categoriaCreditore,
      r.importoDovuto,
      r.percentualeOfferta,
      r.modalita === 'RATEALE' ? 'Rateale' : 'Unica soluzione',
      r.numeroRate ?? '',
      r.rangoLegale ? etichettaRango(r.rangoLegale) : '',
      r.note || '',
    ]);
  }
  // Righe vuote aggiuntive per comodità di compilazione, se il modello parte vuoto.
  if (righe.length === 0) {
    for (let i = 0; i < 10; i++) dati.push(['', '', '', '', '', '', '']);
  }

  const foglio = XLSX.utils.aoa_to_sheet(dati);
  foglio['!cols'] = [
    { wch: 30 },
    { wch: 16 },
    { wch: 10 },
    { wch: 24 },
    { wch: 14 },
    { wch: 30 },
    { wch: 30 },
  ];
  foglio['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglio, 'Proposta');
  XLSX.writeFile(wb, `proposta_${nomeFileSicuro(nomeScenario)}.xlsx`);
}

export interface RisultatoParsingProposta {
  righe: RigaPropostaEsportabile[];
  righeConErrore: { indice: number; motivo: string }[];
}

/** Parole che segnalano una riga di riepilogo/totale, non un vero creditore — da scartare, non da importare come se fosse un dato. */
const PAROLE_RIEPILOGO = ['totale', 'riepilogo', 'somma', 'subtotale', 'totali'];

function sembraRigaDiRiepilogo(categoria: string): boolean {
  const pulito = categoria.trim().toLowerCase();
  return PAROLE_RIEPILOGO.some((parola) => pulito === parola || pulito.startsWith(parola + ' '));
}

function interpretaModalita(testo: unknown): 'UNICA_SOLUZIONE' | 'RATEALE' | null {
  if (typeof testo !== 'string') return null;
  const pulito = testo.trim().toLowerCase();
  if (pulito.startsWith('unica')) return 'UNICA_SOLUZIONE';
  if (pulito.startsWith('rateal')) return 'RATEALE';
  return null;
}

/** Abbina il testo della cella (l'etichetta esportata) al valore del rango — tollerante, non case-sensitive. */
function interpretaRango(testo: unknown): RangoLegale | null {
  if (typeof testo !== 'string' || !testo.trim()) return null;
  const pulito = testo.trim().toLowerCase();
  const trovato = RANGHI_LEGALI.find((r) => r.etichetta.toLowerCase() === pulito);
  return trovato ? trovato.valore : null;
}

/** Legge il file compilato: righe da 1 a N, tollerante su righe vuote di cortesia lasciate nel template. */
export async function importaPropostaExcel(file: File): Promise<RisultatoParsingProposta> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const foglio = wb.Sheets[wb.SheetNames[0]];

  const righe: RigaPropostaEsportabile[] = [];
  const righeConErrore: { indice: number; motivo: string }[] = [];

  const intervallo = XLSX.utils.decode_range(foglio['!ref'] || 'A1');
  const cella = (riga: number, colonna: number) =>
    foglio[XLSX.utils.encode_cell({ r: riga, c: colonna })];

  for (let r = intervallo.s.r; r <= intervallo.e.r; r++) {
    const cellaCategoria = cella(r, 0);
    const categoria = typeof cellaCategoria?.v === 'string' ? cellaCategoria.v.trim() : '';
    if (!categoria || categoria === INTESTAZIONI[0]) continue; // riga vuota o intestazione
    if (sembraRigaDiRiepilogo(categoria)) continue; // riga di totale/riepilogo, non un creditore: da scartare, non da importare

    // Riga di istruzioni (solo la colonna A valorizzata): non è una riga
    // dati, non va trattata come tale né segnalata come errore.
    const colonneSuccessive = [1, 2, 3, 4, 5, 6].map((c) => cella(r, c)?.v);
    if (colonneSuccessive.every((v) => v === undefined || v === '')) continue;

    const importo = Number(cella(r, 1)?.v);

    // La cella "% offerta" può essere formattata come percentuale in
    // Excel (digitando "3%"): il valore grezzo sottostante (.v) è allora
    // 0,03, non 3. La libreria non include il formato della cella (.z)
    // di default — ma include sempre il testo già formattato da Excel
    // (.w, es. "3.00%"): è quello il modo affidabile per riconoscerlo,
    // verificato contro un file reale prima di considerarlo risolto.
    const cellaPercentuale = cella(r, 2);
    let percentuale: number;
    if (typeof cellaPercentuale?.w === 'string' && cellaPercentuale.w.includes('%')) {
      percentuale = Number(cellaPercentuale.w.replace('%', '').replace(',', '.').trim());
    } else {
      percentuale = Number(cellaPercentuale?.v);
    }

    const modalita = interpretaModalita(cella(r, 3)?.v);
    const numeroRateGrezzo = cella(r, 4)?.v;
    const rangoLegale = interpretaRango(cella(r, 5)?.v);
    const noteGrezze = cella(r, 6)?.v;
    const note = typeof noteGrezze === 'string' && noteGrezze.trim() ? noteGrezze.trim() : null;

    if (Number.isNaN(importo) || importo < 0) {
      righeConErrore.push({ indice: r, motivo: `"${categoria}": importo dovuto non valido` });
      continue;
    }
    if (Number.isNaN(percentuale) || percentuale < 0 || percentuale > 100) {
      righeConErrore.push({ indice: r, motivo: `"${categoria}": percentuale offerta non valida` });
      continue;
    }
    if (!modalita) {
      righeConErrore.push({
        indice: r,
        motivo: `"${categoria}": modalità non riconosciuta (scrivere "Unica soluzione" o "Rateale")`,
      });
      continue;
    }
    const numeroRate =
      modalita === 'RATEALE' && numeroRateGrezzo !== '' && numeroRateGrezzo !== undefined
        ? Number(numeroRateGrezzo)
        : null;

    righe.push({
      categoriaCreditore: categoria,
      importoDovuto: importo,
      percentualeOfferta: percentuale,
      modalita,
      numeroRate: numeroRate && !Number.isNaN(numeroRate) ? numeroRate : null,
      rangoLegale,
      note,
    });
  }

  return { righe, righeConErrore };
}
