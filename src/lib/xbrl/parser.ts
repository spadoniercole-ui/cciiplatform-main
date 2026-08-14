// src/lib/xbrl/parser.ts
//
// Estrazione strutturale di un file XBRL/XML: contesti (periodo N / N-1),
// fact grezzi (tag + contextRef + valore) e anagrafica.
// Unico parser XML usato in tutta l'app: fast-xml-parser (già in package.json).
// Non usare regex sul testo XML grezzo altrove: è fragile con namespace,
// attributi e self-closing tag.

import { XMLParser } from 'fast-xml-parser';
import type { Periodo } from './types';

export interface FactGrezzo {
  tagPulito: string; // es. "totaleattivo" (senza namespace, minuscolo, solo alfanumerico)
  tagOriginale: string; // es. "itcc-ci:TotaleAttivo"
  contextRef: string;
  valore: number;
}

export interface DatiEstratti {
  facts: FactGrezzo[];
  contextPeriodo: Record<string, Periodo>;
  /** Anno solare del periodo "corrente" individuato dai contesti XBRL, se determinabile. */
  annoBilancio: number | null;
  anagraficaGrezza: {
    codiceFiscale?: string;
    ragioneSociale?: string;
    indirizzo?: string;
    codiceAteco?: string;
  };
}

function getNodeText(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'object') {
    const n = node as Record<string, unknown>;
    return String(n['#text'] ?? n['text'] ?? n['_'] ?? '').trim();
  }
  return String(node).trim();
}

function parseNumeroItaliano(raw: unknown): number {
  const str = getNodeText(raw);
  if (!str) return 0;
  let cleaned = str;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // 1.234,56 -> 1234.56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // 1234,56 -> 1234.56
    cleaned = cleaned.replace(',', '.');
  }
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Rimuove il namespace (es. "itcc-ci:TotaleAttivo" -> "totaleattivo") e normalizza. */
export function pulisciTag(tag: string): string {
  return (
    tag
      .split(':')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') ?? ''
  );
}

function estraiTuttiIFact(
  obj: unknown,
  facts: FactGrezzo[],
  chiaviAnagrafica: Record<string, string>
): void {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach((item) => estraiTuttiIFact(item, facts, chiaviAnagrafica));
    return;
  }

  const record = obj as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (key.startsWith('@_')) continue;
    const val = record[key];
    if (val === null || val === undefined || val === '') continue;

    const tagPulito = pulisciTag(key);
    const nodes = Array.isArray(val) ? val : [val];

    nodes.forEach((node) => {
      if (node === null || node === undefined) return;

      const isObjNode = typeof node === 'object';
      const nodeRecord = isObjNode ? (node as Record<string, unknown>) : null;
      const contextRef =
        (nodeRecord?.['@_contextRef'] as string | undefined) ||
        (nodeRecord?.['@_contextref'] as string | undefined) ||
        '';

      const testo = getNodeText(node);
      const numero = parseNumeroItaliano(node);

      // Fact numerico con contesto: candidato a dato di bilancio
      if (contextRef && testo !== '' && !Number.isNaN(numero)) {
        facts.push({
          tagPulito,
          tagOriginale: key,
          contextRef,
          valore: numero,
        });
      }

      // Anagrafica: tag noti senza necessariamente un contextRef numerico
      if (tagPulito.includes('codicefiscale') && testo) {
        chiaviAnagrafica.codiceFiscale = testo.toUpperCase();
      }
      if (tagPulito.includes('partitaiva') && testo && !chiaviAnagrafica.codiceFiscale) {
        chiaviAnagrafica.codiceFiscale = testo.toUpperCase();
      }
      if ((tagPulito.includes('denominazione') || tagPulito === 'ragionesociale') && testo) {
        chiaviAnagrafica.ragioneSociale = testo;
      }
      if (
        (tagPulito.includes('sedelegaleindirizzo') ||
          tagPulito.includes('sedelegalecomune') ||
          // Variante osservata in file reali ITCC-CI: un unico campo "DatiAnagraficiSede"
          // con indirizzo, CAP e comune già concatenati in un solo testo.
          tagPulito === 'datianagraficisede') &&
        testo
      ) {
        chiaviAnagrafica.indirizzo = chiaviAnagrafica.indirizzo
          ? `${chiaviAnagrafica.indirizzo}, ${testo}`
          : testo;
      }
      if (
        (tagPulito.includes('codiceateco') ||
          tagPulito.includes('codiceattivita') ||
          // Variante osservata in file reali ITCC-CI: "DatiAnagraficiSettoreAttivitaPrevalenteAteco"
          tagPulito.includes('ateco')) &&
        testo
      ) {
        chiaviAnagrafica.codiceAteco = testo;
      }

      if (isObjNode) {
        estraiTuttiIFact(node, facts, chiaviAnagrafica);
      }
    });
  }
}

/** Individua, tra tutti i contesti dell'istanza, quale sia l'anno corrente (N) e quale il precedente (N-1). */
function costruisciMappaContesti(root: unknown): {
  mappa: Record<string, Periodo>;
  annoCorrente: number | null;
} {
  const mappa: Record<string, Periodo> = {};

  const estraiContesti = (obj: unknown): Record<string, unknown>[] => {
    if (!obj || typeof obj !== 'object') return [];
    if (Array.isArray(obj)) return obj.flatMap(estraiContesti);
    const record = obj as Record<string, unknown>;
    let risultato: Record<string, unknown>[] = [];
    for (const k of Object.keys(record)) {
      if (pulisciTag(k) === 'context') {
        const val = record[k];
        risultato = risultato.concat(
          (Array.isArray(val) ? val : [val]) as Record<string, unknown>[]
        );
      } else if (typeof record[k] === 'object' && !k.startsWith('@_')) {
        risultato = risultato.concat(estraiContesti(record[k]));
      }
    }
    return risultato;
  };

  const contesti = estraiContesti(root);
  const dateTrovate = new Set<string>();
  const dataPerContesto: Record<string, string> = {};

  contesti.forEach((ctx) => {
    if (!ctx) return;
    const id = (ctx['@_id'] as string) || (ctx['@_ID'] as string) || (ctx['id'] as string);
    if (!id) return;

    const periodKey = Object.keys(ctx).find((k) => pulisciTag(k) === 'period');
    const period = periodKey ? (ctx[periodKey] as Record<string, unknown>) : null;
    if (!period) return;

    let dateStr = '';
    for (const pk of Object.keys(period)) {
      const clean = pulisciTag(pk);
      if (clean === 'enddate' || clean === 'instant') {
        dateStr = getNodeText(period[pk]);
        if (dateStr) break;
      }
    }
    if (dateStr && dateStr.length >= 4) {
      dataPerContesto[id] = dateStr;
      dateTrovate.add(dateStr.substring(0, 4));
    }
  });

  const anniOrdinati = Array.from(dateTrovate).sort().reverse();
  const annoCorrente = anniOrdinati[0];
  const annoPrecedente = anniOrdinati[1];

  Object.entries(dataPerContesto).forEach(([id, dateStr]) => {
    if (annoCorrente && dateStr.startsWith(annoCorrente)) mappa[id] = 'corrente';
    else if (annoPrecedente && dateStr.startsWith(annoPrecedente)) mappa[id] = 'precedente';
  });

  return { mappa, annoCorrente: annoCorrente ? parseInt(annoCorrente, 10) : null };
}

/**
 * Parsing completo di un'istanza XBRL: restituisce i fact grezzi (con contextRef),
 * la mappa contesto->periodo e l'anagrafica individuata.
 * Lancia un errore se l'XML non è parsabile o non contiene alcun fact numerico.
 */
export function parseIstanzaXbrl(xmlContent: string): DatiEstratti {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const jsonObj = parser.parse(xmlContent);

  const rootKey = Object.keys(jsonObj || {}).find((k) => k.toLowerCase().includes('xbrl'));
  const root = rootKey ? jsonObj[rootKey] : jsonObj;

  if (!root || typeof root !== 'object') {
    throw new Error('Il file non contiene una struttura XBRL/XML valida.');
  }

  const facts: FactGrezzo[] = [];
  const chiaviAnagrafica: Record<string, string> = {};
  estraiTuttiIFact(root, facts, chiaviAnagrafica);

  if (facts.length === 0) {
    throw new Error('Nessun dato numerico con contesto valido trovato nel file.');
  }

  const { mappa: contextPeriodo, annoCorrente: annoBilancio } = costruisciMappaContesti(root);

  return {
    facts,
    contextPeriodo,
    annoBilancio,
    anagraficaGrezza: chiaviAnagrafica,
  };
}
