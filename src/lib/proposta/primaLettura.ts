// src/lib/proposta/primaLettura.ts
//
// PRIMA LETTURA dei documenti ricevuti: prima di chiedere all'istruttore di
// inquadrare la proposta, la piattaforma legge i documenti così come li ha
// mandati l'azienda e propone strumento, data di deposito e quota degli
// altri creditori aderenti, citando il passo e il documento da cui li ha
// presi.
//
// Perché così: chiedere l'inquadramento PRIMA significava obbligare un
// funzionario — che può conoscere poco la materia — a sfogliare i documenti,
// scegliere lo strumento e cercare una percentuale in un documento che non è
// la proposta. È lì che si sbaglia. La macchina propone, l'istruttore
// conferma o corregge: le scelte restano sue.
//
// Logica pura: prompt e normalizzazione della risposta.

import { STRUMENTI_PROPOSTA, type StrumentoProposta } from './inquadramento';

export interface DatoLetto<T> {
  valore: T | null;
  /** Passo del documento, breve, nelle sue parole. */
  passo: string | null;
  /** Documento in cui si trova (titolo del file). */
  documento: string | null;
}

export interface PrimaLettura {
  strumento: DatoLetto<StrumentoProposta>;
  /** AAAA-MM-GG */
  dataDeposito: DatoLetto<string>;
  /** Quota degli altri creditori aderenti sull'indebitamento, in percentuale 0..100. */
  quotaAltriAderenti: DatoLetto<number>;
  /** Percentuale offerta a questo ente, se la proposta la indica (0..100). */
  percentualeOffertaEnte: DatoLetto<number>;
  /** Avvertenze della lettura (documenti contraddittori, dati ambigui…). */
  note: string[];
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 400) : null;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function dato<T>(g: unknown, valida: (v: unknown) => T | null): DatoLetto<T> {
  const o = obj(g);
  const valore = valida(o.valore);
  return {
    valore,
    passo: valore === null ? null : str(o.passo),
    documento: valore === null ? null : str(o.documento),
  };
}

const strumentoValido = (v: unknown): StrumentoProposta | null =>
  typeof v === 'string' && STRUMENTI_PROPOSTA.some((s) => s.valore === v)
    ? (v as StrumentoProposta)
    : null;

const dataValida = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};

const percentualeValida = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace('%', '').replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100
    ? Math.round(n * 100) / 100
    : null;
};

export function normalizzaPrimaLettura(grezzo: unknown): PrimaLettura {
  const g = obj(grezzo);
  return {
    strumento: dato(g.strumento, strumentoValido),
    dataDeposito: dato(g.dataDeposito, dataValida),
    quotaAltriAderenti: dato(g.quotaAltriAderenti, percentualeValida),
    percentualeOffertaEnte: dato(g.percentualeOffertaEnte, percentualeValida),
    note: (Array.isArray(g.note) ? g.note : [])
      .map(str)
      .filter((x): x is string => !!x)
      .slice(0, 6),
  };
}

export function promptPrimaLettura(rigaAliasEnte: string): string {
  const elenco = STRUMENTI_PROPOSTA.map(
    (s) => `- "${s.valore}": ${s.etichetta} (${s.riferimento})`
  ).join('\n');
  return `Sei davanti ai documenti di una proposta ricevuta da un ente creditore pubblico (proposta, eventuale attestazione/asseverazione del professionista, eventuale piano). Fai una PRIMA LETTURA: individua solo i dati sotto, citando il passo e il documento da cui li prendi. Non valutare la proposta.${rigaAliasEnte}

1. "strumento": lo strumento di regolazione della crisi che l'azienda dichiara di usare. Valori ammessi:
${elenco}
Usa "ALTRO" solo se lo strumento è dichiarato ma non è fra questi; null se i documenti non lo dicono.
2. "dataDeposito": la data di deposito (o di presentazione) della proposta, AAAA-MM-GG; null se non c'è.
3. "quotaAltriAderenti": la percentuale dei crediti degli ALTRI creditori che hanno aderito (o aderiranno) all'accordo, sull'indebitamento complessivo. Spesso non è nella proposta ma nell'attestazione del professionista: leggi tutti i documenti. Numero fra 0 e 100; null se non è indicata.
4. "percentualeOffertaEnte": la percentuale di soddisfacimento offerta a questo ente (0-100); null se non è indicata.

Per ciascun dato: "passo" = la frase del documento, breve e testuale; "documento" = il titolo del documento. Se un dato manca, valore null e niente passo: non dedurre, non stimare. In "note" segnala in poche parole contraddizioni fra documenti o dati ambigui.

Rispondi SOLO con JSON valido:
{"strumento":{"valore":null,"passo":null,"documento":null},"dataDeposito":{"valore":null,"passo":null,"documento":null},"quotaAltriAderenti":{"valore":null,"passo":null,"documento":null},"percentualeOffertaEnte":{"valore":null,"passo":null,"documento":null},"note":[]}`;
}
