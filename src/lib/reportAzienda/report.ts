// src/lib/reportAzienda/report.ts
//
// IL REPORT DELL'AZIENDA — il documento che tiene insieme le due verifiche e
// la valutazione.
//
// Tre regole, e stanno tutte qui:
//  1. il report NON ricalcola nulla: legge le fonti e le compone. Se una
//     fonte manca, la sezione lo dice; non si inventa un numero;
//  2. la verifica amministrativa entra in SOLA LETTURA — il report la cita,
//     non la modifica e non la rilancia;
//  3. l'AI scrive solo la prosa dell'analisi, che arriva dallo screening già
//     passato dal revisore. Numeri, sezioni e avvisi li produce questo modulo,
//     puro e testabile senza database.
//
// Modulo neutro (niente 'use server'): importato dall'azione, dal componente
// e dai test.

import { markdownInHtml } from '@/lib/stampa/markdown';
import type { Riscontri } from '@/lib/normativa/riscontri';
import type { FattiVisura } from '@/lib/visura/fatti';

// ---- Cosa includere ------------------------------------------------------

/** La relazione dell'analisi: si riusa, si rigenera, oppure resta fuori. */
export type SceltaAnalisi = 'RIUSA' | 'RIGENERA' | 'ESCLUDI';

export interface InclusioniReport {
  analisi: SceltaAnalisi;
  /** Il questionario per direttrici: materiale di lavoro, escluso di default. */
  questionario: boolean;
  riscontri: boolean;
  riferimenti: boolean;
}

/**
 * Il questionario è escluso di default: è materiale di lavoro dell'ufficio,
 * non un capitolo del documento che si consegna. Le altre voci entrano,
 * salvo che l'operatore le spenga.
 */
export const INCLUSIONI_PREDEFINITE: InclusioniReport = {
  analisi: 'RIUSA',
  questionario: false,
  riscontri: true,
  riferimenti: true,
};

/**
 * Le inclusioni arrivano dal browser: si accettano solo i valori ammessi, e
 * un valore assente vale il default. Non è una formalità — è il confine fra
 * una scelta dell'operatore e un input qualsiasi.
 */
export function normalizzaInclusioni(v: unknown): InclusioniReport {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const analisi: SceltaAnalisi =
    o.analisi === 'RIGENERA' || o.analisi === 'ESCLUDI' ? o.analisi : 'RIUSA';
  return {
    analisi,
    questionario: o.questionario === true,
    riscontri: o.riscontri !== false,
    riferimenti: o.riferimenti !== false,
  };
}

// ---- Le fonti ------------------------------------------------------------

export interface FonteAmministrativa {
  etichetta: string;
  esito: string;
  copertura: string;
  verificataIl: string | null;
  debitoTotale: number | null;
  debitoFonte: string | null;
  debitoIl: string | null;
}

export interface FonteContabile {
  anniXbrl: number;
  visuraIl: string | null;
  parametriPresenti: boolean;
  completa: boolean;
}

export interface FonteScreening {
  esiste: boolean;
  generatoIl: string | null;
  relazioneTesto: string | null;
  impronta: string | null;
  nomeFileVisura: string | null;
  /** «Oggi», «in scadenza — 5 mesi»…: la validità è una convenzione di lavoro. */
  validita: string | null;
  fatti: FattiVisura | null;
}

export interface RigaProspetto {
  etichetta: string;
  valori: (number | null)[];
  forte: boolean;
}

export interface IndiceProspetto {
  codice: string;
  nome: string;
  soglia: string;
  valori: (number | null)[];
  esiti: (string | null)[];
}

export interface FonteProspetto {
  anni: (number | null)[];
  righe: RigaProspetto[];
  indici: IndiceProspetto[];
}

export interface DomandaQuestionario {
  id: string;
  domanda: string;
  /** «Sì» / «No» / null quando la domanda non ha ancora risposta. */
  risposta: 'Sì' | 'No' | null;
}

export interface SezioneQuestionario {
  titolo: string;
  domande: DomandaQuestionario[];
}

export interface FontiReport {
  ragioneSociale: string;
  partitaIva: string | null;
  codiceFiscale: string | null;
  identificativi: { etichetta: string; valore: string }[];
  amministrativa: FonteAmministrativa | null;
  contabile: FonteContabile | null;
  screening: FonteScreening | null;
  prospetto: FonteProspetto | null;
  riscontri: Riscontri | null;
  questionario: SezioneQuestionario[] | null;
}

// ---- Il report composto --------------------------------------------------

export interface VociReport {
  etichetta: string;
  valore: string;
}

export type SezioneReport =
  | { id: string; titolo: string; tipo: 'voci'; voci: VociReport[]; nota: string | null }
  | { id: string; titolo: string; tipo: 'elenco'; voci: VociReport[]; nota: string | null }
  | { id: string; titolo: string; tipo: 'testo'; testo: string; nota: string | null }
  | {
      id: string;
      titolo: string;
      tipo: 'prospetto';
      anni: (number | null)[];
      righe: RigaProspetto[];
      indici: IndiceProspetto[];
      nota: string | null;
    };

export interface ReportComposto {
  ragioneSociale: string;
  generatoIl: string | null;
  versione: string | null;
  impronta: string | null;
  inclusioni: InclusioniReport;
  avvisi: string[];
  sezioni: SezioneReport[];
}

const euro = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

const numero = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
    : 'n/d';

const data = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('it-IT');
};

const valoreONonDisponibile = (v: string | null | undefined) =>
  v && v.trim() ? v : 'non disponibile';

// ---- Composizione --------------------------------------------------------

export interface EsitoComposizione {
  avvisi: string[];
  sezioni: SezioneReport[];
}

/**
 * Compone le sezioni dalle fonti e dalle inclusioni scelte. Funzione PURA:
 * stesse fonti e stesse inclusioni danno lo stesso documento, in qualunque
 * momento e su qualunque macchina.
 */
export function componiReport(fonti: FontiReport, inclusioni: InclusioniReport): EsitoComposizione {
  const avvisi: string[] = [];
  const sezioni: SezioneReport[] = [];

  // 1. Identikit: anagrafica dell'azienda e fatti della visura. Nessuna
  // interpretazione — sono dati riferiti ai documenti.
  const identikit: VociReport[] = [
    { etichetta: 'Ragione sociale', valore: fonti.ragioneSociale },
    { etichetta: 'Partita IVA', valore: valoreONonDisponibile(fonti.partitaIva) },
    { etichetta: 'Codice fiscale', valore: valoreONonDisponibile(fonti.codiceFiscale) },
  ];
  if (fonti.identificativi.length > 0) {
    identikit.push({
      etichetta: 'Identificativi presso l’ente',
      valore: fonti.identificativi.map((i) => `${i.etichetta}: ${i.valore}`).join(' · '),
    });
  }
  const f = fonti.screening?.fatti ?? null;
  if (f) {
    const vociFatti: [string, string | null][] = [
      ['Forma giuridica', f.formaGiuridica],
      ['Sede legale', f.sedeLegale],
      ['Costituzione', data(f.dataCostituzione)],
      ['Durata', f.durata],
      ['Stato attività', f.statoAttivita],
      ['Capitale sociale', f.capitaleSociale === null ? null : euro(f.capitaleSociale)],
      [
        'Addetti',
        f.addetti === null
          ? null
          : `${f.addetti.numero}${f.addetti.riferimento ? ` (${f.addetti.riferimento})` : ''}`,
      ],
      ['Data della visura', data(f.dataVisura)],
    ];
    for (const [etichetta, valore] of vociFatti) {
      if (valore !== null && valore !== '') identikit.push({ etichetta, valore });
    }
    if (f.procedureConcorsuali.length > 0) {
      identikit.push({
        etichetta: 'Procedure concorsuali in visura',
        valore: f.procedureConcorsuali
          .map(
            (p) =>
              `${p.tipo}${p.data ? ` del ${data(p.data)}` : ''}${
                p.stato ? ` (${p.stato})` : ''
              }${p.tribunale ? ` — ${p.tribunale}` : ''}`
          )
          .join('; '),
      });
    }
  }
  if (fonti.screening?.nomeFileVisura) {
    identikit.push({
      etichetta: 'Visura acquisita',
      valore: `${fonti.screening.nomeFileVisura}${
        fonti.screening.impronta ? ` — impronta ${fonti.screening.impronta.slice(0, 12)}…` : ''
      }`,
    });
  }
  sezioni.push({
    id: 'identikit',
    titolo: '1. Identikit dell’impresa',
    tipo: 'voci',
    voci: identikit,
    nota: 'Anagrafica e fatti della visura: sono dati riferiti ai documenti, non valutazioni.',
  });

  // 2. Esito amministrativo: in sola lettura. Se manca, si dice — non si
  // scrive zero, che sarebbe un debito inesistente.
  const amm = fonti.amministrativa;
  if (amm) {
    const voci: VociReport[] = [
      { etichetta: 'Esito', valore: `${amm.etichetta} (${amm.esito})` },
      { etichetta: 'Copertura', valore: amm.copertura },
      { etichetta: 'Verificata il', valore: valoreONonDisponibile(data(amm.verificataIl)) },
      { etichetta: 'Debito dell’ente', valore: euro(amm.debitoTotale) },
    ];
    if (amm.debitoFonte) voci.push({ etichetta: 'Fonte del debito', valore: amm.debitoFonte });
    if (amm.debitoIl) voci.push({ etichetta: 'Memorizzato il', valore: amm.debitoIl });
    if (amm.debitoTotale === null) {
      avvisi.push(
        'La verifica amministrativa è chiusa ma non ha consegnato un debito: il report non iscrive alcuna cifra dell’ente.'
      );
    }
    sezioni.push({
      id: 'amministrativa',
      titolo: '2. Esito della verifica amministrativa',
      tipo: 'voci',
      voci,
      nota: 'In sola lettura: il report cita l’esito e non lo modifica. La verifica si chiude e si rinnova nella sua scheda.',
    });
  } else {
    avvisi.push(
      'La verifica amministrativa non è ancora stata eseguita: il report non riporta l’esito né il debito dell’ente.'
    );
    sezioni.push({
      id: 'amministrativa',
      titolo: '2. Esito della verifica amministrativa',
      tipo: 'voci',
      voci: [],
      nota: 'Non disponibile: la verifica amministrativa non è ancora stata eseguita.',
    });
  }

  // 3. Verifica contabile: il dato depositato, con il prospetto se c'è.
  const cont = fonti.contabile;
  if (cont) {
    const voci: VociReport[] = [
      {
        etichetta: 'Annualità XBRL in archivio',
        valore: cont.anniXbrl > 0 ? String(cont.anniXbrl) : 'nessuna',
      },
      { etichetta: 'Visura storica', valore: valoreONonDisponibile(data(cont.visuraIl)) },
      {
        etichetta: 'Parametri dell’ente',
        valore: cont.parametriPresenti ? 'compilati' : 'da compilare',
      },
      { etichetta: 'Dato storico', valore: cont.completa ? 'completo' : 'da completare' },
    ];
    if (!cont.completa) {
      avvisi.push(
        'Il dato storico non è completo (visura, parametri dell’ente e almeno un bilancio XBRL): le sezioni contabili vanno lette come parziali.'
      );
    }
    sezioni.push({
      id: 'contabile',
      titolo: '3. Verifica contabile',
      tipo: 'voci',
      voci,
      nota: 'Il dato depositato, senza modifiche: la proiezione è materia della verifica azienda.',
    });
  } else {
    avvisi.push('La verifica contabile non è ancora stata aperta per questa azienda.');
    sezioni.push({
      id: 'contabile',
      titolo: '3. Verifica contabile',
      tipo: 'voci',
      voci: [],
      nota: 'Non disponibile: nessun dato storico acquisito.',
    });
  }

  if (fonti.prospetto && fonti.prospetto.righe.length > 0) {
    sezioni.push({
      id: 'prospetto',
      titolo: 'Prospetto contabile depositato',
      tipo: 'prospetto',
      anni: fonti.prospetto.anni,
      righe: fonti.prospetto.righe,
      indici: fonti.prospetto.indici,
      nota: 'Valori dei bilanci XBRL in archivio. Gli indici sono quelli abilitati nello spazio.',
    });
  }

  // 4. Analisi di inquadramento: l'unico testo dell'AI, e solo quello.
  if (inclusioni.analisi !== 'ESCLUDI') {
    const scr = fonti.screening;
    if (scr && scr.relazioneTesto) {
      const nota = [
        scr.generatoIl ? `Generata il ${data(scr.generatoIl)}` : null,
        scr.validita ? `validità: ${scr.validita}` : null,
        scr.impronta ? `impronta della visura ${scr.impronta.slice(0, 12)}…` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      sezioni.push({
        id: 'analisi',
        titolo: '4. Analisi di inquadramento',
        tipo: 'testo',
        testo: scr.relazioneTesto,
        nota,
      });
      if (scr.validita && /da rivedere|scadenza/i.test(scr.validita)) {
        avvisi.push(
          `La valutazione non è aggiornata (${scr.validita}): va rigenerata sui documenti correnti prima di usarla come fotografia di oggi.`
        );
      }
    } else {
      avvisi.push(
        'Nessuna analisi disponibile: la valutazione completa non è ancora stata generata per questa azienda.'
      );
      sezioni.push({
        id: 'analisi',
        titolo: '4. Analisi di inquadramento',
        tipo: 'testo',
        testo: '',
        nota: 'Non disponibile: nessuna relazione generata.',
      });
    }
  } else {
    avvisi.push('L’analisi di inquadramento è stata esclusa da questo report: restano i dati.');
  }

  // 5. Riscontri normativi: aritmetica sulle soglie, nessuna inferenza.
  if (inclusioni.riscontri) {
    const r = fonti.riscontri;
    if (r) {
      const voci: VociReport[] = [];
      for (const a of r.articoli) {
        voci.push({
          etichetta: `Art. ${a.numero} — ${a.categoria}`,
          valore: a.motivo,
        });
      }
      for (const s of r.soglie) {
        voci.push({
          etichetta: s.parametro,
          valore: `${euro(s.valoreRilevato)} · ${s.soglia} · ${
            s.esito === 'sopra'
              ? 'oltre soglia'
              : s.esito === 'sotto'
                ? 'sotto soglia'
                : 'da verificare'
          } · ${s.fonte}${s.cautela ? ` — ${s.cautela}` : ''}`,
        });
      }
      for (const i of r.indicatori) {
        voci.push({ etichetta: i.nome, valore: `${i.dettaglio} (art. ${i.articolo})` });
      }
      sezioni.push({
        id: 'riscontri',
        titolo: '5. Riscontri normativi',
        tipo: 'elenco',
        voci,
        nota: `Calcolo deterministico sui dati disponibili.${
          r.datiMancanti.length > 0
            ? ` Non verificato automaticamente: ${r.datiMancanti.join('; ')}.`
            : ''
        } Il rilevamento di un segnale non accerta lo stato di crisi.`,
      });
    } else {
      sezioni.push({
        id: 'riscontri',
        titolo: '5. Riscontri normativi',
        tipo: 'elenco',
        voci: [],
        nota: 'Non calcolabili sui dati disponibili.',
      });
    }
  }

  // 6. Questionario: allegato di lavoro, solo se richiesto.
  if (inclusioni.questionario) {
    const q = fonti.questionario;
    if (q && q.length > 0) {
      const voci: VociReport[] = q.map((sezione) => ({
        etichetta: sezione.titolo,
        valore: sezione.domande
          .map((d) => `${d.id}. ${d.domanda} — ${d.risposta ?? 'senza risposta'}`)
          .join('\n'),
      }));
      sezioni.push({
        id: 'questionario',
        titolo: 'Allegato — Questionario per direttrici',
        tipo: 'elenco',
        voci,
        nota: 'Allegato di lavoro: le domande sono mirate alle direttrici dell’ente per questa azienda.',
      });
    } else {
      sezioni.push({
        id: 'questionario',
        titolo: 'Allegato — Questionario per direttrici',
        tipo: 'elenco',
        voci: [],
        nota: 'Nessun questionario generato.',
      });
    }
  }

  // 7. Riferimenti e metodo: che cosa è entrato nel documento e da dove.
  if (inclusioni.riferimenti) {
    const righe: string[] = [
      'Fonti utilizzate: verifica amministrativa (esito e debito memorizzato), verifica contabile (visura, parametri dell’ente, bilanci XBRL), valutazione completa (relazione e questionario).',
      'I numeri sono prodotti dal motore deterministico della piattaforma; l’assistente scrive la sola analisi di inquadramento, già passata dal revisore.',
      'Il report non conclude nel merito, non accerta lo stato di crisi e non sostituisce la valutazione dell’organo competente.',
    ];
    if (fonti.screening?.impronta) {
      righe.push(`Impronta della visura usata: ${fonti.screening.impronta}`);
    }
    if (fonti.screening?.generatoIl) {
      righe.push(`Valutazione generata il ${data(fonti.screening.generatoIl)}.`);
    }
    sezioni.push({
      id: 'riferimenti',
      titolo: 'Riferimenti e metodo',
      tipo: 'testo',
      testo: righe.map((x) => `- ${x}`).join('\n'),
      nota: null,
    });
  }

  return { avvisi, sezioni };
}

// ---- Stampa --------------------------------------------------------------

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function prospettoHtml(sezione: Extract<SezioneReport, { tipo: 'prospetto' }>): string {
  const intestazioni = sezione.anni.map((a) => (a === null ? 'n/d' : String(a)));
  const righe = sezione.righe
    .map(
      (r) =>
        `<tr${r.forte ? ' class="tot"' : ''}><td>${esc(r.etichetta)}</td>${r.valori
          .map((v) => `<td class="num">${euro(v)}</td>`)
          .join('')}</tr>`
    )
    .join('');
  const indici = sezione.indici
    .map(
      (i) =>
        `<tr><td>${esc(i.codice)} — ${esc(i.nome)}</td><td>${esc(i.soglia)}</td>${i.valori
          .map(
            (v, k) =>
              `<td class="num">${v === null ? '—' : numero(v)}${
                i.esiti[k] === 'VIOLATO' ? ' (oltre soglia)' : ''
              }</td>`
          )
          .join('')}</tr>`
    )
    .join('');
  return `
    <table><thead><tr><th>Voce</th>${intestazioni
      .map((a) => `<th class="num">${esc(a)}</th>`)
      .join('')}</tr></thead><tbody>${righe}</tbody></table>
    ${
      sezione.indici.length > 0
        ? `<h3 style="font-size:12px">Indici per annualità</h3>
           <table><thead><tr><th>Indice</th><th>Soglia</th>${intestazioni
             .map((a) => `<th class="num">${esc(a)}</th>`)
             .join('')}</tr></thead><tbody>${indici}</tbody></table>`
        : ''
    }`;
}

function sezioneHtml(s: SezioneReport): string {
  const titolo = `<h2 style="font-size:14px;margin-top:24px">${esc(s.titolo)}</h2>`;
  const nota = s.nota ? `<p class="note">${esc(s.nota)}</p>` : '';
  if (s.tipo === 'testo') {
    return `${titolo}${s.testo ? `<div class="md">${markdownInHtml(s.testo)}</div>` : ''}${nota}`;
  }
  if (s.tipo === 'prospetto') {
    return `${titolo}${prospettoHtml(s)}${nota}`;
  }
  if (s.voci.length === 0) return `${titolo}${nota}`;
  if (s.tipo === 'elenco') {
    return `${titolo}<ul>${s.voci
      .map((v) => `<li><strong>${esc(v.etichetta)}</strong> — ${esc(v.valore)}</li>`)
      .join('')}</ul>${nota}`;
  }
  return `${titolo}<table><tbody>${s.voci
    .map((v) => `<tr><td>${esc(v.etichetta)}</td><td>${esc(v.valore)}</td></tr>`)
    .join('')}</tbody></table>${nota}`;
}

/**
 * Il corpo HTML della stampa: solo dai dati del report composto. Il testo
 * dell'analisi passa da `markdownInHtml`, che escapa prima di convertire;
 * tutto il resto è escapato qui.
 */
export function htmlReport(r: ReportComposto): string {
  const avvisi =
    r.avvisi.length > 0
      ? `<div style="border:1px solid #fcd34d;background:#fffbeb;padding:10px 12px;margin:0 0 18px"><strong>Da leggere prima</strong><ul>${r.avvisi
          .map((a) => `<li>${esc(a)}</li>`)
          .join('')}</ul></div>`
      : '';
  const sezioni = r.sezioni.map(sezioneHtml).join('\n');
  const piede = `<p class="note">Versione ${esc(r.versione ?? 'n/d')}${
    r.impronta ? ` · impronta del contenuto ${esc(r.impronta.slice(0, 16))}…` : ''
  }</p>`;
  return `${avvisi}${sezioni}${piede}`;
}
