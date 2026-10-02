// src/lib/piano/elaborazioneAi.ts
//
// TERZO LIVELLO del piano: l'AI scrive le ipotesi, cella per cella e con la
// motivazione; il motore deterministico (piano.ts) calcola. L'AI non produce
// mai numeri di risultato (EBITDA, cassa, coperture): solo ipotesi d'ingresso.
// Il risultato si salva come variante «elaborazione-ai», accanto a quelle
// dell'operatore, e non ne sostituisce nessuna.
//
// Uguale per i due lati; cambiano i dati sul tavolo e la domanda:
//   - Ricevente: ipotesi motivate a partire dal piano dell'azienda,
//     ricondotte al riferimento di settore dove l'azienda è più ottimista;
//   - Redigente: ipotesi motivate per un piano che sostenga le rate della
//     proposta, dicendo su quali leve agisce e dove non basta.
//
// Velocità: una sola chiamata, contesto compatto costruito con i dati già
// caricati nella pagina (nessuna nuova lettura dal database), risposta JSON
// breve e validata qui, senza seconde chiamate di correzione.

import { cercaTerminiLessico, LESSICO, SOSTITUZIONI_DIRETTE } from '@/lib/lessico/lessico';
import { rettifichePulite, type Rettifiche } from './rettifiche';
import {
  ETICHETTA_RIGA,
  RIGHE_FLUSSO,
  RIGHE_INPUT,
  type EsercizioStorico,
  type Ipotesi,
  type IpotesiPiano,
  type RigaInput,
} from './piano';

export type LatoPiano = 'RICEVUTA' | 'DA_DEFINIRE';

export const VARIANTE_AI = 'elaborazione-ai';

export interface ContestoElaborazione {
  lato: LatoPiano;
  orizzonte: number;
  /** Storico dal più recente (al massimo tre esercizi). */
  storico: EsercizioStorico[];
  crescita: { tasso: number; descrizione: string };
  rate: { ente: number[]; altri: number[] };
  /** Ricevente: valori del piano dell'azienda per riga e anno (euro). */
  pianoAzienda?: Partial<Record<RigaInput, Record<string, number>>> | null;
  /** Ricevente: righe su cui l'azienda è più ottimista del riferimento oltre le soglie. */
  scostamenti?: { voce: string; luce: 'giallo' | 'rosso'; ottimismoMassimo: number }[];
  /** Redigente: le ipotesi della variante su cui sta lavorando. */
  ipotesiCorrenti?: IpotesiPiano | null;
  /** Vincoli che scattano con il piano di partenza (testo breve). */
  vincoli?: string[];
}

const arrot = (n: number) => Math.round(n);

/** Contesto compatto per il modello: solo numeri utili, niente ripetizioni. */
export function testoContesto(c: ContestoElaborazione): string {
  const primoAnno = (c.storico[0]?.anno ?? 0) + 1;
  const anni = Array.from({ length: c.orizzonte }, (_, i) => primoAnno + i);
  const righeStorico = c.storico
    .map(
      (s) =>
        `${s.anno}: ricavi ${arrot(s.ricaviVendite)}; valore produzione ${arrot(s.valoreProduzione)}; costi produzione ${arrot(s.costiProduzione)} (ammortamenti ${arrot(s.ammortamenti)}); oneri finanziari ${arrot(s.oneriFinanziari)}; utile ${arrot(s.utileEsercizio)}; crediti clienti ${arrot(s.creditiClienti)}; debiti fornitori ${arrot(s.debitiFornitori)}; debiti banche ${arrot(s.debitiBanche)}; liquidità ${arrot(s.disponibilitaLiquide)}; patrimonio netto ${arrot(s.patrimonioNetto)}`
    )
    .join('\n');
  const parti = [
    `ANNI DEL PIANO: ${anni.join(', ')} (indice 0 = ${anni[0]}).`,
    `STORICO (euro):\n${righeStorico}`,
    `RIFERIMENTO DI SETTORE: ${c.crescita.descrizione} Tasso usato dal piano automatico: ${c.crescita.tasso}% annuo.`,
    `RATE DELLA PROPOSTA per anno (euro): ente ${c.rate.ente.map(arrot).join(' / ')}; altri creditori ${c.rate.altri.map(arrot).join(' / ')}.`,
  ];
  if (c.pianoAzienda && Object.keys(c.pianoAzienda).length) {
    parti.push(
      `PIANO DELL'AZIENDA (euro):\n${Object.entries(c.pianoAzienda)
        .map(
          ([r, v]) =>
            `${r}: ${anni.map((a) => (v?.[String(a)] !== undefined ? arrot(v![String(a)]) : '—')).join(' / ')}`
        )
        .join('\n')}`
    );
  }
  if (c.scostamenti?.length) {
    parti.push(
      `SCOSTAMENTI FAVOREVOLI ALL'AZIENDA OLTRE SOGLIA: ${c.scostamenti
        .map((s) => `${s.voce} (${s.luce}, fino a +${s.ottimismoMassimo}%)`)
        .join('; ')}.`
    );
  }
  if (c.ipotesiCorrenti && Object.keys(c.ipotesiCorrenti).length) {
    parti.push(
      `IPOTESI ATTUALI DELL'OPERATORE:\n${Object.entries(c.ipotesiCorrenti)
        .map(
          ([r, arr]) =>
            `${r}: ${(arr ?? []).map((ip) => (ip ? `${ip.valore}${ip.tipo === 'pct' ? '%' : '€'}` : '—')).join(' / ')}`
        )
        .join('\n')}`
    );
  }
  if (c.vincoli?.length) parti.push(`VINCOLI CHE SCATTANO OGGI: ${c.vincoli.join(' ')}`);
  return parti.join('\n\n');
}

function lessicoBreve(): string {
  const vietati = LESSICO.filter(
    (v) => v.classe === 'VIETATO_AUTOMATICO' || v.classe === 'RISERVATO_PROFESSIONISTA'
  ).map((v) => `«${v.termine}»`);
  return `Nelle motivazioni non usare come giudizio i termini ${vietati.join(', ')}; non dire che l'azienda è in crisi o insolvente; nessun giudizio sulle persone. Descrivi dati e ipotesi.`;
}

/** Il Ricevente con il piano dell'azienda caricato rettifica quel piano; gli altri casi girano le manopole. */
export function modoRettifiche(c: ContestoElaborazione): boolean {
  return (
    c.lato === 'RICEVUTA' &&
    !!c.pianoAzienda &&
    Object.values(c.pianoAzienda).some((v) => v && Object.keys(v).length > 0)
  );
}

/**
 * Prompt dell'AI. Risposta compatta: UN valore per riga (una manopola),
 * uguale per tutti gli anni — così il modello non deve scrivere decine di
 * celle (la risposta lunga si troncava e l'elaborazione falliva).
 */
export function promptElaborazione(c: ContestoElaborazione): string {
  if (modoRettifiche(c)) {
    const righe = Object.keys(c.pianoAzienda ?? {}).filter((r) =>
      RIGHE_INPUT.includes(r as RigaInput)
    ) as RigaInput[];
    return `Sei l'analista dell'ente creditore che ha RICEVUTO la proposta. Il punto di partenza è il PIANO DELL'AZIENDA: non costruisci un piano tuo, lo metti alla prova. Per ogni riga del piano dell'azienda indica UNA rettifica percentuale, uguale per tutti gli anni: 0 se la riga è credibile così; negativa dove l'azienda è più ottimista del riferimento di settore e dello storico senza ragioni nei dati (per i costi, positiva se l'azienda li sottostima). Esempio: ricavi −10 = ogni anno il 10% in meno di quanto dichiara l'azienda.

Righe da rettificare (una voce ciascuna, valore tra −50 e +50):
${righe.map((r) => `- ${r}: ${ETICHETTA_RIGA[r]}`).join('\n')}

Ogni valore con una motivazione di una frase (al massimo 25 parole) che richiama il dato su cui si fonda (scostamento dal riferimento, storico, settore). Il calcolo lo fa la piattaforma. ${lessicoBreve()}

DATI
${testoContesto(c)}

Rispondi SOLO con JSON:
{"rettifiche": {"ricaviVendite": {"valore": -10, "motivazione": "..."}}, "sintesi": "tre frasi al massimo: impostazione e limiti"}`;
  }
  const compito =
    c.lato === 'RICEVUTA'
      ? `Sei l'analista dell'ente creditore che ha RICEVUTO la proposta. Il piano dell'azienda non è stato caricato: imposta ipotesi prudenti e documentate a partire dallo stato attuale, dallo storico e dal riferimento di settore.`
      : `Sei l'analista che REDIGE la proposta. Imposta ipotesi ragionevoli e documentate che, se i dati lo consentono, generino la cassa per pagare le rate della proposta, restando entro valori plausibili rispetto a storico e settore. Se le rate non si possono coprire con ipotesi plausibili, non forzare: dillo nella sintesi.`;
  return `${compito}

Imposti le MANOPOLE del piano: per ogni riga UN valore, uguale per tutti gli anni, a partire dallo STATO ATTUALE (il primo esercizio dello storico; il passato non si modifica). Il calcolo (EBITDA, utile, cassa, copertura delle rate) lo fa la piattaforma. Righe e forma:
${RIGHE_INPUT.map((r) => `- ${r}: ${ETICHETTA_RIGA[r]} — ${r === 'aliquotaImposte' ? '"abs", aliquota in %' : RIGHE_FLUSSO.has(r) ? '"abs", euro per anno' : '"pct", variazione % annua'}`).join('\n')}

Regole: tutte le righe; variazioni % tra -50 e +50 (0 = invariato); ogni valore con una motivazione di una frase (al massimo 25 parole) che richiama il dato su cui si fonda. ${lessicoBreve()}

DATI
${testoContesto(c)}

Rispondi SOLO con JSON:
{"ipotesi": {"ricaviVendite": {"tipo": "pct", "valore": 3, "motivazione": "..."}}, "sintesi": "tre frasi al massimo: impostazione e limiti"}`;
}

export interface EsitoElaborazione {
  ipotesi: IpotesiPiano;
  /** Solo nel modo rettifiche (Ricevente con il piano dell'azienda). */
  rettifiche?: Rettifiche;
  sintesi: string;
  scartati: string[];
}

/** Ripulisce una motivazione dai termini non ammessi (sostituzione deterministica, nessuna nuova chiamata). */
export function motivazionePulita(testo: string, massimo = 300): string {
  let t = testo.replace(/\s+/g, ' ').trim().slice(0, massimo);
  for (const s of SOSTITUZIONI_DIRETTE)
    t = t.replace(new RegExp(s.modello.source, s.modello.flags), s.con);
  for (const r of cercaTerminiLessico(t, {
    classi: ['VIETATO_AUTOMATICO', 'RISERVATO_PROFESSIONISTA'],
  }).reverse()) {
    t =
      t.slice(0, r.posizione) + r.voce.formulaSostitutiva + t.slice(r.posizione + r.trovato.length);
  }
  return t;
}

const NOTA_COME_PRIMA = 'Non indicato dall’AI: come l’anno prima.';

/**
 * Celle lasciate vuote dal modello in una riga che ha toccato: si riempiono
 * con il significato dichiarato («come l'anno prima») — 0% per le variazioni,
 * lo stesso valore per i valori assoluti — invece di restare vuote.
 */
function completaRiga(r: RigaInput, arr: (Ipotesi | null)[]): (Ipotesi | null)[] {
  let prec: Ipotesi | null = null;
  return arr.map((ip) => {
    if (ip) {
      prec = ip;
      return ip;
    }
    if (prec && (prec.tipo === 'abs' || r === 'aliquotaImposte'))
      return { tipo: prec.tipo, valore: prec.valore, motivazione: NOTA_COME_PRIMA };
    if (r === 'aliquotaImposte') return null;
    return {
      tipo: RIGHE_FLUSSO.has(r) ? 'abs' : 'pct',
      valore: 0,
      motivazione: NOTA_COME_PRIMA,
    };
  });
}

/** Valida la risposta del modello: solo righe, tipi e intervalli ammessi. */
export function validaRisposta(json: unknown, orizzonte: number): EsitoElaborazione {
  const scartati: string[] = [];
  const ipotesi: IpotesiPiano = {};
  const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const grezze = (obj.ipotesi && typeof obj.ipotesi === 'object' ? obj.ipotesi : {}) as Record<
    string,
    unknown
  >;
  for (const [riga, grezzo] of Object.entries(grezze)) {
    let valori: unknown = grezzo;
    if (!RIGHE_INPUT.includes(riga as RigaInput)) {
      scartati.push(`riga sconosciuta «${riga}»`);
      continue;
    }
    const r = riga as RigaInput;
    // Una manopola: un solo valore per la riga, uguale per tutti gli anni.
    if (valori && typeof valori === 'object' && !Array.isArray(valori))
      valori = Array.from({ length: orizzonte }, () => grezzo);
    if (!Array.isArray(valori)) continue;
    const celle = valori as unknown[];
    const arr: (Ipotesi | null)[] = Array.from({ length: orizzonte }, (_, i) => {
      const v = celle[i] as Record<string, unknown> | null | undefined;
      if (!v || typeof v !== 'object') return null;
      const valore = Number(v.valore);
      let tipo = v.tipo === 'abs' ? 'abs' : 'pct';
      if (RIGHE_FLUSSO.has(r)) tipo = 'abs';
      if (!Number.isFinite(valore)) return null;
      if (r === 'aliquotaImposte' && (valore < 0 || valore > 60)) {
        scartati.push(`${ETICHETTA_RIGA[r]} anno ${i + 1}: ${valore}% fuori intervallo`);
        return null;
      }
      if (r !== 'aliquotaImposte' && tipo === 'pct' && Math.abs(valore) > 50) {
        scartati.push(`${ETICHETTA_RIGA[r]} anno ${i + 1}: ${valore}% fuori intervallo`);
        return null;
      }
      if (tipo === 'abs' && (valore < 0 || valore > 1e12)) {
        scartati.push(`${ETICHETTA_RIGA[r]} anno ${i + 1}: valore non ammesso`);
        return null;
      }
      const motivazione = typeof v.motivazione === 'string' ? motivazionePulita(v.motivazione) : '';
      return {
        tipo: tipo as 'pct' | 'abs',
        valore: Math.round(valore * 100) / 100,
        ...(motivazione ? { motivazione } : {}),
      };
    });
    if (arr.some(Boolean)) ipotesi[r] = completaRiga(r, arr);
  }
  // Righe non toccate: scritte esplicite («invariato»), così la tabella non
  // ha celle vuote accanto a celle piene. L'aliquota resta quella implicita.
  const toccate = Object.keys(ipotesi).length > 0;
  for (const r of RIGHE_INPUT) {
    if (!toccate || ipotesi[r] || r === 'aliquotaImposte') continue;
    ipotesi[r] = Array.from({ length: orizzonte }, () => ({
      tipo: RIGHE_FLUSSO.has(r) ? ('abs' as const) : ('pct' as const),
      valore: 0,
    }));
  }
  const sintesi = typeof obj.sintesi === 'string' ? motivazionePulita(obj.sintesi, 600) : '';
  return { ipotesi, sintesi, scartati };
}

/** Valida le rettifiche dell'AI sul piano dell'azienda. */
export function validaRettificheAi(json: unknown, righeAmmesse: RigaInput[]): EsitoElaborazione {
  const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const grezze = rettifichePulite(obj.rettifiche);
  const scartati: string[] = [];
  const rettifiche: Rettifiche = {};
  for (const [r, v] of Object.entries(grezze) as [
    RigaInput,
    { valore: number; motivazione?: string },
  ][]) {
    if (!righeAmmesse.includes(r)) {
      scartati.push(`riga non presente nel piano dell’azienda «${r}»`);
      continue;
    }
    if (Math.abs(v.valore) > 50) {
      scartati.push(`${ETICHETTA_RIGA[r]}: ${v.valore}% fuori intervallo`);
      continue;
    }
    rettifiche[r] = {
      valore: v.valore,
      ...(v.motivazione ? { motivazione: motivazionePulita(v.motivazione) } : {}),
    };
  }
  const sintesi = typeof obj.sintesi === 'string' ? motivazionePulita(obj.sintesi, 600) : '';
  return { ipotesi: {}, rettifiche, sintesi, scartati };
}
