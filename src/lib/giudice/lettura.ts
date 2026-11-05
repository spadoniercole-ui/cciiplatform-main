// src/lib/giudice/lettura.ts
//
// LETTURA DEL PROVVEDIMENTO DEL GIUDICE — decreto di liquidazione giudiziale
// o dispositivo di cram down. Non è una proposta: qui non c'è nulla da
// valutare o da accettare, c'è un atto che il giudice ha già formato e che
// l'ente deve riscontrare con i propri dati.
//
// Per questo la lettura estrae solo ciò che è scritto: crediti ammessi o
// riconosciuti, rango, percentuale di soddisfacimento o realizzo, spese e
// tempi. Niente stime, niente numeri presi dalla memoria del modello: se un
// dato non c'è, resta null e sarà il confronto a dire che non è calcolabile.
//
// Logica pura: normalizzazione della risposta e prompt. Nessun database.

import { RANGHI, type RangoCredito } from '@/lib/triage/scenari';

/** I tre atti che possono dare origine a uno scenario ricevuto da un ente. */
export type TipoAttoGiudice = 'PROPOSTA' | 'DECRETO_LIQUIDAZIONE' | 'CRAM_DOWN';

/** Stato della scelta iniziale: la domanda si pone appena creato lo scenario. */
export type TipoIstruttoria = TipoAttoGiudice | 'DA_CHIEDERE';

export const ETICHETTA_ATTO: Record<TipoAttoGiudice, string> = {
  PROPOSTA: 'Proposta',
  DECRETO_LIQUIDAZIONE: 'Decreto di liquidazione giudiziale',
  CRAM_DOWN: 'Dispositivo di cram down',
};

export function etichettaIstruttoria(tipo?: TipoIstruttoria | null): string {
  if (!tipo || tipo === 'DA_CHIEDERE') return 'Percorso da definire';
  return ETICHETTA_ATTO[tipo];
}

export const DESCRIZIONE_ATTO: Record<TipoAttoGiudice, string> = {
  PROPOSTA:
    "L'azienda ha presentato una proposta: si valuta nel merito, si riscontra con i parametri dell'ente e si genera la relazione.",
  DECRETO_LIQUIDAZIONE:
    'Il tribunale ha aperto la liquidazione giudiziale: si riscontrano i crediti e il realizzo indicati dal giudice con la posizione dell’ente, si misura la perdita e si valutano gli elementi per una contestazione.',
  CRAM_DOWN:
    'Il tribunale ha omologato un cram down: si riscontrano crediti e percentuali indicate dal giudice con la posizione dell’ente, si misura la perdita e si valutano gli elementi per una contestazione.',
};

export const TIPI_ATTO: TipoAttoGiudice[] = ['PROPOSTA', 'DECRETO_LIQUIDAZIONE', 'CRAM_DOWN'];

export function tipoAttoValido(valore: unknown): valore is TipoAttoGiudice {
  return typeof valore === 'string' && (TIPI_ATTO as string[]).includes(valore);
}

export function tipoIstruttoriaValido(valore: unknown): valore is TipoIstruttoria {
  return valore === 'DA_CHIEDERE' || tipoAttoValido(valore);
}

export interface CreditoLetto {
  voce: string;
  /** Importo ammesso o riconosciuto dal giudice, in euro. */
  importo: number;
  rango: RangoCredito | null;
  /** Testo del privilegio così come scritto nell'atto, se c'è. */
  privilegio: string | null;
  /** Percentuale di soddisfacimento o di realizzo prevista per questo credito (0..100). */
  percentualeRealizzo: number | null;
  documento: string | null;
  passo: string | null;
}

export interface LetturaProvvedimento {
  crediti: CreditoLetto[];
  /** Spese di procedura, in percentuale sul realizzo lordo. */
  speseProceduraPct: number | null;
  /** Durata stimata della procedura, in mesi. */
  tempiMesi: number | null;
  /** Data dell'atto, AAAA-MM-GG. */
  dataAtto: string | null;
  /** Avvertenze della lettura: dati ambigui, documenti in contraddizione. */
  note: string[];
}

export const LETTURA_VUOTA: LetturaProvvedimento = {
  crediti: [],
  speseProceduraPct: null,
  tempiMesi: null,
  dataAtto: null,
  note: [],
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const testo = (v: unknown, max = 300): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;

/**
 * Numeri scritti come li scrive un atto italiano: «1.234,56 €», «35%»,
 * «0,35». Il punto è il separatore delle migliaia solo quando ci sono
 * gruppi di tre cifre; altrimenti è un decimale.
 */
export function numeroDaTesto(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/[€\s]/g, '').replace(/%/g, '').replace(/'/g, '').trim();
  if (s === '') return null;
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const importoValido = (v: unknown): number | null => {
  const n = numeroDaTesto(v);
  return n !== null && n >= 0 ? Math.round(n * 100) / 100 : null;
};

const percentualeValida = (v: unknown): number | null => {
  const n = numeroDaTesto(v);
  if (n === null || n < 0) return null;
  // Un atto può scrivere 0,35 invece di 35: si accetta solo la scala 0..100,
  // perché una frazione dichiarata come tale non è ambigua.
  return n <= 100 ? Math.round(n * 100) / 100 : null;
};

const RANGO_DA_TESTO: { rango: RangoCredito; pattern: RegExp }[] = [
  {
    rango: 'PREDEDUCIBILE',
    pattern: /prededuc|spese di procedura|crediti della procedura|nella procedura/,
  },
  { rango: 'PRIVILEGIATO', pattern: /privileg|prelazion|ipotecar|pignoratiz|art\.?\s*27/ },
  { rango: 'CHIROGRAFARIO', pattern: /chirograf|non privileg|concorsual/ },
  { rango: 'POSTERGATO', pattern: /postergat|subordinat/ },
];

export function rangoDaTesto(v: unknown): RangoCredito | null {
  if (typeof v === 'string') {
    const diretto = RANGHI.find((r) => r.codice === v.trim().toUpperCase());
    if (diretto) return diretto.codice;
    const t = v.toLowerCase();
    return RANGO_DA_TESTO.find((r) => r.pattern.test(t))?.rango ?? null;
  }
  return null;
}

const dataValida = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};

/**
 * Normalizza la risposta della lettura. Scarta i crediti senza voce o senza
 * importo: un credito senza importo non è confrontabile, e inventarne uno
 * sarebbe peggio che dichiararlo assente.
 */
export function normalizzaLettura(grezzo: unknown): LetturaProvvedimento {
  const g = obj(grezzo);
  const creditiGrezzi = Array.isArray(g.crediti) ? g.crediti : [];
  const crediti: CreditoLetto[] = [];
  for (const c of creditiGrezzi) {
    const o = obj(c);
    const voce = testo(o.voce, 240);
    const importo = importoValido(o.importo ?? o.importoAmmesso);
    if (!voce || importo === null) continue;
    crediti.push({
      voce,
      importo,
      rango: rangoDaTesto(o.rango),
      privilegio: testo(o.privilegio, 240),
      percentualeRealizzo: percentualeValida(o.percentualeRealizzo ?? o.percentualeSoddisfacimento),
      documento: testo(o.documento, 200),
      passo: testo(o.passo, 400),
    });
  }

  const tempi = numeroDaTesto(g.tempiMesi);
  return {
    crediti,
    speseProceduraPct: percentualeValida(g.speseProceduraPct),
    tempiMesi: tempi !== null && tempi >= 0 ? Math.round(tempi) : null,
    dataAtto: dataValida(g.dataAtto),
    note: (Array.isArray(g.note) ? g.note : [])
      .map((n) => testo(n, 300))
      .filter((n): n is string => !!n)
      .slice(0, 8),
  };
}

/** Il testo dell'atto da cui è stata fatta la lettura. */
export function promptLetturaProvvedimento(
  tipoAtto: Exclude<TipoAttoGiudice, 'PROPOSTA'>,
  rigaAliasEnte: string
): string {
  const fuoco =
    tipoAtto === 'DECRETO_LIQUIDAZIONE'
      ? `l'atto con cui il tribunale ha aperto (o proseguito) la liquidazione giudiziale. Cerca i crediti ammessi o riconosciuti, il rango, il realizzo previsto e i tempi della procedura`
      : `il dispositivo con cui il tribunale ha omologato il cram down. Cerca i crediti riconosciuti, il rango, la percentuale di soddisfacimento stabilita per ciascuno e i tempi`;
  return `Sei davanti a ${fuoco}. Leggi TUTTI i documenti allegati, compresi eventuali stato passivo, perizia, relazione del commissario e piano.${rigaAliasEnte}

Estrai SOLO ciò che è scritto. Se un dato non c'è, valore null: non dedurlo, non stimarlo, non ricavarlo da un altro rango. Un importo va scritto in euro, una percentuale fra 0 e 100.

Restituisci un oggetto JSON valido, senza testo prima o dopo:
{
  "dataAtto": "AAAA-MM-GG" | null,
  "speseProceduraPct": number | null,
  "tempiMesi": number | null,
  "crediti": [
    {
      "voce": "il creditore o la voce di credito come scritta nell'atto",
      "importo": number,
      "rango": "PREDEDUCIBILE" | "PRIVILEGIATO" | "CHIROGRAFARIO" | "POSTERGATO" | null,
      "privilegio": "il testo del privilegio, se indicato" | null,
      "percentualeRealizzo": number | null,
      "documento": "titolo del documento",
      "passo": "la frase breve e testuale da cui hai preso il dato"
    }
  ],
  "note": ["contraddizioni fra documenti o dati ambigui, in poche parole"]
}

REGOLE:
- Una riga per credito distinto. Se l'atto elenca più posizioni dello stesso creditore, tienile separate.
- "percentualeRealizzo": la percentuale di soddisfacimento o di realizzo che l'atto prevede per quel credito. Se l'atto non la indica, null.
- "rango": solo se l'atto lo qualifica; in caso contrario null. Non dedurre il rango dalla natura del credito.
- "importo" è l'importo ammesso o riconosciuto dal giudice, non quello richiesto dall'azienda.
- Non aggiungere crediti che non compaiono nei documenti.`;
}
