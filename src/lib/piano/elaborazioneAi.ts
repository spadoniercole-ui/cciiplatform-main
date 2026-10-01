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

export function promptElaborazione(c: ContestoElaborazione): string {
  const compito =
    c.lato === 'RICEVUTA'
      ? `Sei l'analista dell'ente creditore che ha RICEVUTO la proposta. Scrivi le ipotesi di un piano alternativo, ragionevole e documentato: parti dal piano dell'azienda e riconducilo al riferimento di settore e allo storico dove l'azienda è più ottimista senza ragioni nei dati; dove il piano dell'azienda è in linea, conservalo. Se il piano dell'azienda manca, parti dal riferimento di settore e dallo storico.`
      : `Sei l'analista che REDIGE la proposta. Scrivi le ipotesi di un piano ragionevole e documentato che, se i dati lo consentono, generi la cassa per pagare le rate della proposta: indica su quali leve agisci (ricavi, costi, incassi, pagamenti, investimenti, apporti) restando entro valori plausibili rispetto a storico e settore. Se le rate non si possono coprire con ipotesi plausibili, non forzare: dillo nella sintesi.`;
  return `${compito}

Scrivi SOLO ipotesi d'ingresso: il calcolo (EBITDA, utile, cassa, copertura delle rate) lo fa la piattaforma. Righe ammesse e forma:
${RIGHE_INPUT.map((r) => `- ${r}: ${ETICHETTA_RIGA[r]} — ${r === 'aliquotaImposte' ? 'percentuale (tipo "abs", valore in %)' : RIGHE_FLUSSO.has(r) ? 'valore assoluto in euro (tipo "abs")' : 'variazione % sull’anno prima (tipo "pct") oppure valore in euro (tipo "abs")'}`).join('\n')}

Regole: ${c.orizzonte} valori per riga (uno per anno, null se lasci il valore dell'anno prima); variazioni % tra -50 e +50; ogni valore non nullo con una motivazione di una frase (al massimo 25 parole) che richiama il dato su cui si fonda (storico, settore, piano dell'azienda, rate). Ometti le righe che non tocchi. ${lessicoBreve()}

DATI
${testoContesto(c)}

Rispondi SOLO con JSON:
{"ipotesi": {"ricaviVendite": [{"tipo": "pct", "valore": 3, "motivazione": "..."}, null]}, "sintesi": "tre frasi al massimo: impostazione e limiti"}`;
}

export interface EsitoElaborazione {
  ipotesi: IpotesiPiano;
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

/** Valida la risposta del modello: solo righe, tipi e intervalli ammessi. */
export function validaRisposta(json: unknown, orizzonte: number): EsitoElaborazione {
  const scartati: string[] = [];
  const ipotesi: IpotesiPiano = {};
  const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const grezze = (obj.ipotesi && typeof obj.ipotesi === 'object' ? obj.ipotesi : {}) as Record<
    string,
    unknown
  >;
  for (const [riga, valori] of Object.entries(grezze)) {
    if (!RIGHE_INPUT.includes(riga as RigaInput)) {
      scartati.push(`riga sconosciuta «${riga}»`);
      continue;
    }
    if (!Array.isArray(valori)) continue;
    const r = riga as RigaInput;
    const arr: (Ipotesi | null)[] = Array.from({ length: orizzonte }, (_, i) => {
      const v = valori[i] as Record<string, unknown> | null | undefined;
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
    if (arr.some(Boolean)) ipotesi[r] = arr;
  }
  const sintesi = typeof obj.sintesi === 'string' ? motivazionePulita(obj.sintesi, 600) : '';
  return { ipotesi, sintesi, scartati };
}
