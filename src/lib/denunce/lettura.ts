// src/lib/denunce/lettura.ts
//
// Lettura dei tre fogli INPS. Solo estrazione: l'analisi sta in analisi.ts,
// funzione pura con i propri test.
//
// I tre tracciati hanno struttura FISSA — sono estrazioni dei sistemi
// dell'istituto, non file compilati a mano — quindi le intestazioni si
// cercano per nome invece di chiedere all'operatore di mappare le colonne.
// Se un'intestazione attesa manca, il file viene rifiutato con l'elenco di
// ciò che non si è trovato: meglio non leggerlo che leggerlo storto.

import { leggiFoglioAoa } from '@/lib/debitiEnte/tracciatoExcel';
import type { RigaDenuncia, RigaDelega, RigaInadempienza } from './analisi';
import { leggiImportoItaliano } from '@/lib/debitiTriage/mappatura';

function normalizza(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Trova la riga di intestazione cercando le colonne attese. */
function trovaIntestazione(
  aoa: unknown[][],
  attese: string[]
): { riga: number; indici: Record<string, number> } | null {
  const cercate = attese.map(normalizza);
  for (let r = 0; r < Math.min(aoa.length, 15); r++) {
    const celle = (aoa[r] ?? []).map(normalizza);
    const indici: Record<string, number> = {};
    let trovate = 0;
    cercate.forEach((c, i) => {
      // `startsWith` in entrambi i versi perché alcune intestazioni sono
      // troncate nel foglio ("Importo debito a..." invece del testo intero).
      const idx = celle.findIndex((x) => x.length > 0 && (x.startsWith(c) || c.startsWith(x)));
      if (idx >= 0) {
        indici[attese[i]] = idx;
        trovate++;
      }
    });
    if (trovate === attese.length) return { riga: r, indici };
  }
  return null;
}

function numero(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  // Una sola regola per gli importi italiani, in tutta la piattaforma.
  // Questa funzione ne aveva una propria che toglieva SEMPRE i punti — e
  // leggeva "35.25" come 3525 — mentre la mappatura dei prospetti leggeva
  // "418.709" come 418,709. Due funzioni che sbagliano in direzioni opposte
  // sono peggio di una: si unificano.
  const n = leggiImportoItaliano(s);
  return Number.isFinite(n) ? n : 0;
}

function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  return s === '' || s.toLowerCase() === 'nan' ? null : s;
}

export interface EsitoLettura<T> {
  righe: T[];
  /** Colonne attese e non trovate: il file non è quello giusto. */
  colonneMancanti?: string[];
}

// VARIANTI DELLO STESSO TRACCIATO.
//
// Lo stesso dato esce dai sistemi dell'Istituto con intestazioni diverse a
// seconda del punto da cui lo si preleva: dal Cassetto e' "Periodo comp." /
// "Data present.", da INPS-CPC e' "Periodo Competenza" / "Data di
// Trasmissione". Cambia anche il verso del periodo — 09/2024 contro 2024/09 —
// ma quello lo scanner accetta gia' in entrambi i sensi.
//
// Riconoscere una variante sola significava rifiutare un file corretto
// dicendo che mancavano colonne che c'erano, con altro nome.
const VARIANTI_DENUNCE: string[][] = [
  ['Periodo comp.', 'Data present.', 'Saldo'],
  ['Periodo Competenza', 'Data di Trasmissione', 'Saldo'],
];

export async function leggiElencoDenunce(file: File): Promise<EsitoLettura<RigaDenuncia>> {
  const { aoa } = await leggiFoglioAoa(file);

  let t: ReturnType<typeof trovaIntestazione> = null;
  let colonne: string[] = VARIANTI_DENUNCE[0];
  for (const v of VARIANTI_DENUNCE) {
    const trovata = trovaIntestazione(aoa, v);
    if (trovata) {
      t = trovata;
      colonne = v;
      break;
    }
  }
  if (!t) {
    // Si dichiarano le colonne della PRIMA variante: elencarle tutte
    // confonderebbe. Il messaggio dice comunque che il tracciato non e'
    // riconosciuto, non che il file e' sbagliato.
    return { righe: [], colonneMancanti: VARIANTI_DENUNCE[0] };
  }

  const [colPeriodo, colData, colSaldo] = colonne;
  const righe: RigaDenuncia[] = [];
  for (let r = t.riga + 1; r < aoa.length; r++) {
    const riga = aoa[r] ?? [];
    const periodo = String(riga[t.indici[colPeriodo]] ?? '').trim();
    // Entrambi i versi: MM/AAAA dal Cassetto, AAAA/MM da INPS-CPC.
    if (!/^\d{1,2}\/\d{4}$/.test(periodo) && !/^\d{4}\/\d{1,2}$/.test(periodo)) continue;
    righe.push({
      periodo,
      dataPresentazione: data(riga[t.indici[colData]]),
      saldo: numero(riga[t.indici[colSaldo]]),
    });
  }
  return { righe };
}

/**
 * Il file F24 di INPS-CPC e' un aggregato per ANNO: porta anno, posizione e
 * importo pagato, senza periodo di competenza ne' data di versamento.
 *
 * Non e' una variante dell'Elenco Deleghe: e' un altro dato. Con questo il
 * ritardo di oltre 90 giorni NON e' calcolabile, perche' il ritardo si misura
 * sul singolo versamento. Riconoscerlo serve a dirlo, invece di lasciar
 * credere che il file sia stato accettato.
 */
export async function eF24Aggregato(file: File): Promise<boolean> {
  try {
    const { aoa } = await leggiFoglioAoa(file);
    const conPeriodo = trovaIntestazione(aoa, ['Periodo comp.']);
    const aggregato = trovaIntestazione(aoa, ['Anno', 'Importo Pagato']);
    return !conPeriodo && !!aggregato;
  } catch {
    return false;
  }
}

const COL_DELEGHE = ['Periodo comp.', 'Data versamento', 'Importo', 'Codice tributo'];

export async function leggiElencoDeleghe(file: File): Promise<EsitoLettura<RigaDelega>> {
  const { aoa } = await leggiFoglioAoa(file);
  const t = trovaIntestazione(aoa, COL_DELEGHE);
  if (!t) return { righe: [], colonneMancanti: COL_DELEGHE };

  // Esito e Stato servono a escludere storni e altre gestioni: se mancano,
  // non si può filtrare e il versato risulterebbe più alto del vero.
  const celle = (aoa[t.riga] ?? []).map(normalizza);
  const idxEsito = celle.findIndex((x) => x.startsWith('esito'));
  const idxStato = celle.findIndex((x) => x.startsWith('stato'));

  const righe: RigaDelega[] = [];
  for (let r = t.riga + 1; r < aoa.length; r++) {
    const riga = aoa[r] ?? [];
    const periodo = String(riga[t.indici['Periodo comp.']] ?? '').trim();
    if (!/^\d{1,2}\/\d{4}$/.test(periodo)) continue;
    righe.push({
      periodo,
      dataVersamento: data(riga[t.indici['Data versamento']]),
      importo: numero(riga[t.indici['Importo']]),
      codiceTributo: String(riga[t.indici['Codice tributo']] ?? '').trim(),
      esito: idxEsito >= 0 ? String(riga[idxEsito] ?? '').trim() : null,
      stato: idxStato >= 0 ? String(riga[idxStato] ?? '').trim() : null,
    });
  }
  return { righe };
}

const COL_INADEMPIENZE = ['Inizio Periodo', 'Importo Addebitato', 'Importo Accreditato'];

export async function leggiListaInadempienze(file: File): Promise<EsitoLettura<RigaInadempienza>> {
  const { aoa } = await leggiFoglioAoa(file);
  const t = trovaIntestazione(aoa, COL_INADEMPIENZE);
  if (!t) return { righe: [], colonneMancanti: COL_INADEMPIENZE };

  const righe: RigaInadempienza[] = [];
  for (let r = t.riga + 1; r < aoa.length; r++) {
    const riga = aoa[r] ?? [];
    const periodo = String(riga[t.indici['Inizio Periodo']] ?? '').trim();
    if (!/^\d{4}\/\d{1,2}$/.test(periodo)) continue;
    righe.push({
      inizioPeriodo: periodo,
      importoAddebitato: numero(riga[t.indici['Importo Addebitato']]),
      importoAccreditato: numero(riga[t.indici['Importo Accreditato']]),
    });
  }
  return { righe };
}

// ---------------------------------------------------------------------------
// RICONOSCIMENTO AUTOMATICO DEI PROSPETTI
//
// Il triage ha un solo punto di caricamento per la posizione debitoria: si
// portano N file di qualunque natura, e il sistema capisce da solo cosa
// sono. Prima c'erano campi fissi — uno per il V.E.R.A., tre per i fogli
// INPS — che mostravano come presupposto quello che è invece documentazione a
// corredo, e convivevano sulla stessa pagina con l'inserimento manuale.
//
// Si riconosce dalle INTESTAZIONI, mai dal nome del file: lo stesso dato
// arriva con nomi diversi secondo il punto di prelievo, e un nome non prova
// nulla sul contenuto.
//
// L'ordine dei tentativi conta: il file F24 aggregato va riconosciuto PRIMA
// dell'Elenco Deleghe, perché condivide alcune intestazioni ma non porta il
// dettaglio per periodo — scambiarli farebbe credere calcolabile un ritardo
// che non lo è.

export type TipoProspetto =
  'DENUNCE' | 'DELEGHE' | 'F24_AGGREGATO' | 'INADEMPIENZE' | 'VERA' | 'SCONOSCIUTO';

export async function riconosciProspetto(file: File): Promise<TipoProspetto> {
  let aoa: unknown[][];
  try {
    aoa = (await leggiFoglioAoa(file)).aoa;
  } catch {
    // Non è un foglio di calcolo leggibile: può essere un PDF, un documento,
    // un'immagine. Non lo si scarta in silenzio — si dichiara sconosciuto.
    return 'SCONOSCIUTO';
  }

  if (
    trovaIntestazione(aoa, ['Anno', 'Importo Pagato']) &&
    !trovaIntestazione(aoa, ['Periodo comp.'])
  ) {
    return 'F24_AGGREGATO';
  }
  for (const v of VARIANTI_DENUNCE) {
    if (trovaIntestazione(aoa, v)) return 'DENUNCE';
  }
  if (trovaIntestazione(aoa, COL_DELEGHE)) return 'DELEGHE';
  if (trovaIntestazione(aoa, COL_INADEMPIENZE)) return 'INADEMPIENZE';

  // Il V.E.R.A. non ha una riga di intestazione unica: è organizzato in
  // sezioni con titolo. Lo si riconosce dalla parola che le sezioni portano.
  const testo = aoa
    .slice(0, 40)
    .flat()
    .map((c) => String(c ?? '').toUpperCase())
    .join(' ');
  if (/DETTAGLIO|V\.?E\.?R\.?A|POSIZIONE CONTRIBUTIVA|PERIODO DAL/.test(testo)) return 'VERA';

  return 'SCONOSCIUTO';
}

export const ETICHETTA_PROSPETTO: Record<TipoProspetto, string> = {
  DENUNCE: 'Elenco denunce (UNIEMENS)',
  DELEGHE: 'Elenco deleghe (F24 per periodo)',
  F24_AGGREGATO: 'F24 aggregato per anno',
  INADEMPIENZE: 'Lista inadempienze',
  VERA: 'Posizione V.E.R.A.',
  SCONOSCIUTO: 'Struttura non riconosciuta',
};
