// src/lib/posizioneAggiornata/letturaPdf.ts
//
// POSIZIONE AGGIORNATA DA PDF. L'azienda manda spesso la situazione
// contabile infrannuale in PDF (situazione patrimoniale, conto economico di
// periodo, elenco creditori), non in Excel. Il passo accettava solo fogli di
// calcolo, e il documento ricevuto non si poteva caricare.
//
// L'AI legge il PDF e riporta i valori nei campi del prospetto, con la data
// di riferimento. Ciò che il documento non espone resta vuoto ed è
// dichiarato: niente stime. L'istruttore controlla e salva.
//
// Logica pura: prompt e normalizzazione.

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import { CAMPI_POSIZIONE, DATI_VUOTI, type ChiaveCampoPosizione } from './schemaCampi';

export interface LetturaPosizionePdf {
  dataRiferimento: string | null;
  dati: DatiFinanziariPeriodo;
  /** Campi trovati nel documento. */
  trovati: ChiaveCampoPosizione[];
  /** Campi che il documento non espone (restano a zero, da completare se serve). */
  mancanti: ChiaveCampoPosizione[];
  note: string[];
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/[€\s]/g, '');
  if (t === '') return null;
  // 1.234.567,89 / -354.000 / 1234567.89
  const pulito = /,\d{1,2}$/.test(t)
    ? t.replace(/\./g, '').replace(',', '.')
    : t.replace(/\.(?=\d{3}(\D|$))/g, '');
  const n = Number(pulito);
  return Number.isFinite(n) ? n : null;
}

const dataValida = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};

export function normalizzaLetturaPosizione(grezzo: unknown): LetturaPosizionePdf {
  const g = obj(grezzo);
  const campi = obj(g.campi);
  const dati: DatiFinanziariPeriodo = { ...DATI_VUOTI };
  const trovati: ChiaveCampoPosizione[] = [];
  const mancanti: ChiaveCampoPosizione[] = [];
  for (const c of CAMPI_POSIZIONE) {
    const n = numero(campi[c.chiave]);
    if (n === null) {
      mancanti.push(c.chiave);
    } else {
      dati[c.chiave] = Math.round(n * 100) / 100;
      trovati.push(c.chiave);
    }
  }
  return {
    dataRiferimento: dataValida(g.dataRiferimento),
    dati,
    trovati,
    mancanti,
    note: (Array.isArray(g.note) ? g.note : [])
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      .map((x) => x.trim().slice(0, 300))
      .slice(0, 8),
  };
}

export function promptLetturaPosizione(): string {
  const elenco = CAMPI_POSIZIONE.map((c) => `- "${c.chiave}": ${c.etichetta}`).join('\n');
  return `Il documento allegato è una situazione contabile infrannuale di un'impresa (situazione patrimoniale, eventuale conto economico di periodo, eventuale elenco dei creditori). Riporta i valori nei campi sotto, in euro, come numeri (negativi con il segno meno).

Campi:
${elenco}

Regole:
- usa i valori ESPOSTI nel documento; se un totale non è esposto ma lo sono tutte le sue voci (es. il totale dei debiti come somma delle voci di debito), puoi sommarle e lo dichiari in "note";
- i campi che il documento non permette di ricavare valgono null: non stimare, non prendere valori di altri periodi;
- il conto economico di un periodo infrannuale (es. primo semestre) si riporta così com'è, dichiarando il periodo in "note";
- "dataRiferimento" è la data della situazione (AAAA-MM-GG).

Rispondi SOLO con JSON valido:
{"dataRiferimento": null, "campi": {${CAMPI_POSIZIONE.map((c) => `"${c.chiave}": null`).join(', ')}}, "note": []}`;
}
