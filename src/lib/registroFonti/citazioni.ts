// src/lib/registroFonti/citazioni.ts
//
// CITAZIONI NORMATIVE NEL TESTO — controllo REV-001 in forma deterministica.
// Il revisore estrae ogni riferimento a una norma dal testo generato e lo
// riscontra sul registro delle fonti: una norma che non c'e' nel registro non
// e' stata verificata da nessuno. E' cosi' che l'AI ha citato «D.M. 26/10/2009»
// e «D.M. 26/10/2011» per lo stesso obbligo (Uniemens: la fonte vera e' il
// D.L. 269/2003, art. 44, comma 9, indicata da Ercole).
//
// Logica pura. Non capisce il senso della frase: sa solo se la norma citata e'
// nel registro, e in che stato.

import { FONTI, type Fonte } from './fonti';

export interface CitazioneNormativa {
  testo: string;
  posizione: number;
  /** Chiave normalizzata per il confronto: es. «dlgs 14/2019 art 25-novies», «dl 269/2003 art 44». */
  chiave: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[’']/g, '').trim();

/**
 * Riconosce: «art. 25-novies CCII», «art. 63, comma 4, del D.Lgs. 14/2019»,
 * «D.L. 269/2003, art. 44», «D.M. 26 ottobre 2009», «artt. 2482-bis e
 * 2482-ter c.c.», «circolare INPS n. 28/2023».
 */
export function estraiCitazioni(testo: string): CitazioneNormativa[] {
  const trovate: CitazioneNormativa[] = [];
  const art =
    'artt?\\.?\\s*(\\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)';
  const atto =
    '(d\\.?\\s*lgs\\.?|d\\.?\\s*l\\.?|d\\.?\\s*m\\.?|d\\.?\\s*p\\.?\\s*r\\.?|l\\.|legge|decreto[- ]legge|decreto legislativo|decreto ministeriale)\\s*(?:n\\.?\\s*)?(\\d{1,4})\\s*\\/\\s*(\\d{4})';
  const rxArtNorma = new RegExp(
    `${art}(?:,?\\s*(?:comma|c\\.)\\s*\\d+[a-z-]*)?(?:,?\\s*lett\\.\\s*[a-z]\\))?[^.;\\n]{0,25}?(?:\\bccii\\b|codice della crisi|del\\s+${atto}|${atto})`,
    'giu'
  );
  const rxNormaArt = new RegExp(`${atto},?\\s*${art}`, 'giu');
  const rxAttoData =
    /(d\.?\s*m\.?|decreto ministeriale|d\.?\s*l\.?|d\.?\s*lgs\.?)\s*(\d{1,2})\s+([a-zà]+)\s+(\d{4})(?:,?\s*n\.?\s*(\d+))?/giu;
  const rxLf =
    /artt?\.?\s*(\d{1,3}(?:-(?:bis|ter|quater))?)(?:\s*(?:e|,)\s*(\d{1,3}(?:-(?:bis|ter|quater))?))?\s*(?:l\.\s*fall\.|l\.f\.|legge\s+fallimentare|r\.d\.\s*267\/1942)/giu;
  const rxCc =
    /artt?\.?\s*(\d{4}(?:-(?:bis|ter|quater))?)(?:\s*(?:e|,)\s*(\d{4}(?:-(?:bis|ter|quater))?))?\s*(?:c\.c\.|cod\.?\s*civ\.?|codice civile)/giu;
  const rxDd =
    /decreto dirigenziale(?:\s+del\s+ministero\s+della\s+giustizia)?\s+(?:del\s+)?(\d{1,2})\s+([a-zà]+)\s+(\d{4})/giu;
  const rxCirc =
    /(?:circolare|circ\.)\s*(inps|inail|agenzia delle entrate|ade)?\s*(?:n\.?\s*)?(\d+)\s*(?:\/|del\s+\d{1,2}\s+[a-z]+\s+)?(\d{4})(?:\/E)?/giu;

  for (const m of testo.matchAll(rxArtNorma)) {
    const attoNome = m[2] ? norm(m[2]) : m[5] ? norm(m[5]) : 'ccii';
    const num = m[3] ?? m[6];
    const anno = m[4] ?? m[7];
    const chiave = num
      ? `${tipoAtto(attoNome)} ${num}/${anno} art ${m[1].toLowerCase()}`
      : `ccii art ${m[1].toLowerCase()}`;
    trovate.push({ testo: m[0], posizione: m.index ?? 0, chiave });
  }
  for (const m of testo.matchAll(rxNormaArt)) {
    trovate.push({
      testo: m[0],
      posizione: m.index ?? 0,
      chiave: `${tipoAtto(norm(m[1]))} ${m[2]}/${m[3]} art ${m[4].toLowerCase()}`,
    });
  }
  for (const m of testo.matchAll(rxAttoData)) {
    // «D.L. 30 settembre 2003, n. 269»: se c'e' il numero, la chiave e' quella
    // dell'atto (dl 269/2003); se prima c'e' «art. 44, comma 9, del», l'articolo
    // si aggiunge alla chiave.
    const pos = m.index ?? 0;
    if (m[5]) {
      const prima = testo.slice(Math.max(0, pos - 60), pos);
      const art = prima.match(
        /artt?\.?\s*(\d+(?:-[a-z]+)?)(?:,?\s*(?:comma|c\.)\s*\d+[a-z-]*)?,?\s*(?:del|della|dello)\s*$/iu
      );
      const atto = `${tipoAtto(norm(m[1]))} ${m[5]}/${m[4]}`;
      trovate.push({
        testo: m[0],
        posizione: pos,
        chiave: art ? `${atto} art ${art[1].toLowerCase()}` : atto,
      });
    } else {
      trovate.push({
        testo: m[0],
        posizione: pos,
        chiave: `${tipoAtto(norm(m[1]))} ${m[2]} ${norm(m[3])} ${m[4]}`,
      });
    }
  }
  for (const m of testo.matchAll(rxDd)) {
    trovate.push({
      testo: m[0],
      posizione: m.index ?? 0,
      chiave: `dd ${m[1]} ${norm(m[2])} ${m[3]}`,
    });
  }
  for (const m of testo.matchAll(rxLf)) {
    trovate.push({ testo: m[0], posizione: m.index ?? 0, chiave: `lf art ${m[1].toLowerCase()}` });
    if (m[2])
      trovate.push({
        testo: m[0],
        posizione: m.index ?? 0,
        chiave: `lf art ${m[2].toLowerCase()}`,
      });
  }
  for (const m of testo.matchAll(rxCc)) {
    trovate.push({ testo: m[0], posizione: m.index ?? 0, chiave: `cc art ${m[1].toLowerCase()}` });
    if (m[2])
      trovate.push({
        testo: m[0],
        posizione: m.index ?? 0,
        chiave: `cc art ${m[2].toLowerCase()}`,
      });
  }
  for (const m of testo.matchAll(rxCirc)) {
    trovate.push({
      testo: m[0],
      posizione: m.index ?? 0,
      chiave: `circ ${m[1] ? norm(m[1]) + ' ' : ''}${m[2]}/${m[3]}`,
    });
  }
  // Una stessa posizione puo' essere colta da due modelli: si tiene la prima.
  const viste = new Set<string>();
  return trovate
    .sort((a, b) => a.posizione - b.posizione)
    .filter((c) => {
      const k = `${c.posizione}|${c.chiave}`;
      if (viste.has(k)) return false;
      viste.add(k);
      return true;
    });
}

function tipoAtto(s: string): string {
  if (/lgs|legislativo/.test(s)) return 'dlgs';
  if (/^d\.?\s*l\b|decreto[- ]legge/.test(s)) return 'dl';
  if (/^d\.?\s*m|ministeriale/.test(s)) return 'dm';
  if (/p\.?\s*r/.test(s)) return 'dpr';
  return 'l';
}

/** Chiavi con cui una fonte del registro puo' essere citata. */
export function chiaviFonte(f: Fonte): string[] {
  const n = norm(f.norma);
  const chiavi: string[] = [];
  const articoli: string[] = [];
  for (const m of n.matchAll(
    /artt?\.?\s*((?:\d+(?:-[a-z]+)?)(?:\s*(?:,|e)\s*\d+(?:-[a-z]+)?)*)/g
  )) {
    for (const a of m[1].split(/\s*,\s*|\s+e\s+/)) if (a) articoli.push(a);
  }
  const isCcii = /ccii|14\/2019|codice della crisi/.test(n);
  const attoM =
    n.match(/(d\.lgs\.|d\.l\.|d\.m\.|l\.)\s*(?:\d{1,2}\s+[a-zà]+\s+)?(\d{4}),?\s*n\.\s*(\d+)/) ??
    n.match(/(d\.lgs\.|d\.l\.|d\.m\.|l\.)\s*(\d+)\/(\d{4})/);
  let atto: string | null = null;
  if (attoM) {
    const tipo = tipoAtto(attoM[1]);
    const anno = attoM[2].length === 4 ? attoM[2] : attoM[3];
    const num = attoM[2].length === 4 ? attoM[3] : attoM[2];
    atto = `${tipo} ${num}/${anno}`;
  }
  for (const a of articoli) {
    if (isCcii) {
      chiavi.push(`ccii art ${a}`);
      chiavi.push(`dlgs 14/2019 art ${a}`);
    } else if (/codice civile/.test(n)) chiavi.push(`cc art ${a}`);
    else if (/legge fallimentare|267\/1942|r\.d\. 16 marzo 1942/.test(n))
      chiavi.push(`lf art ${a}`);
    else if (atto) chiavi.push(`${atto} art ${a}`);
  }
  // L'atto e' citabile anche senza articolo («il D.L. 269/2003»).
  if (atto) chiavi.push(atto);
  // Decreto dirigenziale datato: «decreto dirigenziale 23 aprile 2026»
  const dd = n.match(/decreto dirigenziale[^0-9]*(\d{1,2})\s+([a-zà]+)\s+(\d{4})/);
  if (dd) chiavi.push(`dd ${dd[1]} ${dd[2]} ${dd[3]}`);
  const circ = n.match(/circolare\s+(inps|inail)?\s*n\.\s*(\d+)\/(\d{4})/);
  if (circ) chiavi.push(`circ ${circ[1] ? circ[1] + ' ' : ''}${circ[2]}/${circ[3]}`);
  const circE = n.match(
    /circ\.\s*(\d+)\/e\/(\d{4})|circolare\s+n\.\s*(\d+)\/e\s+del\s+\d+\s+[a-z]+\s+(\d{4})/
  );
  if (circE) chiavi.push(`circ ${circE[1] ?? circE[3]}/${circE[2] ?? circE[4]}`);
  return chiavi;
}

export interface EsitoRiscontroCitazioni {
  riscontrate: { citazione: CitazioneNormativa; fonte: Fonte }[];
  /** Citate ma assenti dal registro: nessuno le ha verificate. */
  nonInRegistro: CitazioneNormativa[];
  /** Nel registro, ma abrogate o non ancora verificate. */
  nonSostenibili: { citazione: CitazioneNormativa; fonte: Fonte }[];
}

export function riscontraCitazioni(testo: string, fonti: Fonte[] = FONTI): EsitoRiscontroCitazioni {
  const indice = new Map<string, Fonte>();
  for (const f of fonti) for (const k of chiaviFonte(f)) if (!indice.has(k)) indice.set(k, f);
  const esito: EsitoRiscontroCitazioni = { riscontrate: [], nonInRegistro: [], nonSostenibili: [] };
  // «artt. 2482-bis e 2482-ter c.c.» produce due chiavi per la stessa citazione
  // e la stessa fonte: un solo rilievo.
  const gia = new Set<string>();
  for (const c of estraiCitazioni(testo)) {
    const f = indice.get(c.chiave);
    const k = `${c.posizione}|${f?.id ?? '-'}`;
    if (gia.has(k)) continue;
    gia.add(k);
    if (!f) esito.nonInRegistro.push(c);
    else if (f.stato === 'abrogato' || f.stato === 'da_verificare' || !f.verificata)
      esito.nonSostenibili.push({ citazione: c, fonte: f });
    else esito.riscontrate.push({ citazione: c, fonte: f });
  }
  return esito;
}
