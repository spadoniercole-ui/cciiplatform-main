// src/lib/dashboard/avanzamento.ts
//
// A CHE PUNTO È OGNI POSIZIONE, IN UN COLPO D'OCCHIO (0.245.0).
//
// La dashboard di spazio aveva quattro pannelli, uno per porta d'ingresso: chi
// ha dieci aziende in verifica doveva leggere quattro elenchi e ricomporre a
// mente la stessa azienda. Qui i quattro elenchi diventano una riga per
// azienda, con quattro tappe: verifica amministrativa, verifica contabile,
// verifica azienda (le due lette insieme, con la fotografia salvata) e
// analisi di scenari.
//
// TRE STATI, NON DUE. «Mancante» e «parziale» non sono la stessa cosa: una
// verifica contabile con la visura acquisita e nessun bilancio è un lavoro
// cominciato, e chi guarda deve poterlo distinguere da un'azienda mai toccata.
// «Non disponibile» è il quarto stato: un Operatore non legge le verifiche
// contabili, e dire «mancante» di ciò che non si può leggere sarebbe una
// bugia.
//
// LE TAPPE SI DECIDONO IN UN PUNTO SOLO. Quale delle tre verifiche è fatta lo
// dice `statoDirettrici` (lib/verificaAzienda/direttrici): la scheda azienda e
// questo riepilogo leggono la stessa regola e non possono dire verdi diversi.
//
// Logica pura: nessun accesso al database, si prova con i test.

import {
  statoDirettrici,
  type SegnaliDirettrici,
  type Stadio,
} from '@/lib/verificaAzienda/direttrici';

export type { Stadio };

export interface AziendaAmministrativa {
  id: number;
  ragioneSociale: string;
}

export interface AziendaContabile {
  id: number;
  ragioneSociale: string;
  completa: boolean;
  anniXbrl: number;
  visuraPresente: boolean;
}

export interface AziendaCompleta {
  id: number;
  ragioneSociale: string;
  /** Esiste la fotografia salvata come base della proposta. */
  baseAziendaleSalvata: boolean;
}

export interface ScenarioPosizione {
  aziendaRagioneSociale: string;
}

export interface AvanzamentoPosizione {
  /** null quando la posizione esiste solo come scenario (azienda non più in elenco). */
  aziendaId: number | null;
  ragioneSociale: string;
  amministrativa: Stadio;
  contabile: Stadio;
  aziendale: Stadio;
  scenari: Stadio;
  scenariCreati: number;
  /** Tappe complete su quattro: serve a ordinare il riepilogo. */
  tappeComplete: number;
  /** La tappa più avanzata raggiunta, in una parola. */
  fase: string;
}

const ORDINE_FASI = ['Da iniziare', 'Amministrativa', 'Contabile', 'Completa aziendale', 'Scenari'];

/** I segnali di chi non ha ancora nulla: conta solo cosa è leggibile. */
const senzaSegnali = (contabile: AziendaContabile[] | null): SegnaliDirettrici => ({
  amministrativaLetta: false,
  contabile: contabile === null ? null : { completa: false, anniXbrl: 0, visuraPresente: false },
  baseAziendaleSalvata: false,
});

/**
 * Lo stato delle quattro tappe per ogni azienda dello spazio.
 *
 * L'elenco delle aziende è l'unione di ciò che i pannelli conoscono: chi ha una
 * verifica amministrativa, chi una contabile, chi è in verifica azienda e chi
 * ha uno scenario. Una posizione che compare in un solo elenco resta visibile,
 * con le altre tappe vuote: è proprio quella che si rischia di dimenticare.
 */
export function avanzamentoPosizioni(input: {
  verifiche: AziendaAmministrativa[];
  contabile: AziendaContabile[] | null;
  azienda: AziendaCompleta[] | null;
  scenari: ScenarioPosizione[];
}): AvanzamentoPosizione[] {
  const perId = new Map<number, AvanzamentoPosizione>();
  const normalizza = (testo: string) => testo.trim().toLowerCase();

  const riga = (id: number | null, ragioneSociale: string): AvanzamentoPosizione => {
    const chiave = id ?? -1;
    const gia = id !== null ? perId.get(chiave) : undefined;
    if (gia) return gia;
    const nuova: AvanzamentoPosizione = {
      aziendaId: id,
      ragioneSociale,
      amministrativa: 'MANCANTE',
      contabile: input.contabile === null ? 'NON_DISPONIBILE' : 'MANCANTE',
      aziendale: input.azienda === null ? 'NON_DISPONIBILE' : 'MANCANTE',
      scenari: 'MANCANTE',
      scenariCreati: 0,
      tappeComplete: 0,
      fase: 'Da iniziare',
    };
    if (id !== null) perId.set(chiave, nuova);
    return nuova;
  };

  // I segnali grezzi, raccolti per azienda: le tre tappe si decidono tutte in
  // `statoDirettrici`, non qui.
  const segnali = new Map<number, SegnaliDirettrici>();
  const segnaleDi = (id: number): SegnaliDirettrici => {
    const gia = segnali.get(id);
    if (gia) return gia;
    const nuovo = senzaSegnali(input.contabile);
    segnali.set(id, nuovo);
    return nuovo;
  };

  for (const v of input.verifiche) {
    riga(v.id, v.ragioneSociale);
    segnaleDi(v.id).amministrativaLetta = true;
  }

  for (const c of input.contabile ?? []) {
    riga(c.id, c.ragioneSociale);
    segnaleDi(c.id).contabile = {
      completa: c.completa,
      anniXbrl: c.anniXbrl,
      visuraPresente: c.visuraPresente,
    };
  }

  for (const a of input.azienda ?? []) {
    riga(a.id, a.ragioneSociale);
    segnaleDi(a.id).baseAziendaleSalvata = a.baseAziendaleSalvata;
  }

  // Gli scenari si legano all'azienda per nome: la riga dello scenario non
  // porta l'id. Se il nome non trova un'azienda in elenco, la posizione entra
  // comunque con le sue tappe vuote — lo scenario esiste e va visto.
  const senzaId = new Map<string, AvanzamentoPosizione>();
  for (const s of input.scenari) {
    const cercato = normalizza(s.aziendaRagioneSociale);
    const trovata = [...perId.values()].find((r) => normalizza(r.ragioneSociale) === cercato);
    if (trovata) {
      trovata.scenari = 'COMPLETO';
      trovata.scenariCreati += 1;
      continue;
    }
    const r =
      senzaId.get(cercato) ??
      ({
        aziendaId: null,
        ragioneSociale: s.aziendaRagioneSociale,
        amministrativa: 'MANCANTE' as Stadio,
        contabile: (input.contabile === null ? 'NON_DISPONIBILE' : 'MANCANTE') as Stadio,
        aziendale: (input.azienda === null ? 'NON_DISPONIBILE' : 'MANCANTE') as Stadio,
        scenari: 'COMPLETO' as Stadio,
        scenariCreati: 0,
        tappeComplete: 0,
        fase: 'Da iniziare',
      } satisfies AvanzamentoPosizione);
    r.scenariCreati += 1;
    senzaId.set(cercato, r);
  }

  const tutte = [...perId.values(), ...senzaId.values()].map((r) => {
    const stato = statoDirettrici(
      r.aziendaId === null ? senzaSegnali(input.contabile) : segnaleDi(r.aziendaId)
    );
    const tappeComplete = [
      stato.amministrativa,
      stato.contabile,
      stato.aziendale,
      r.scenari,
    ].filter((s) => s === 'COMPLETO').length;
    // La fase è l'ultima tappa raggiunta nell'ordine del lavoro: si scende
    // dalla più avanzata, così «Scenari» vince su tutto.
    const raggiunta = [
      { stadio: r.scenari, nome: ORDINE_FASI[4] },
      { stadio: stato.aziendale, nome: ORDINE_FASI[3] },
      { stadio: stato.contabile, nome: ORDINE_FASI[2] },
      { stadio: stato.amministrativa, nome: ORDINE_FASI[1] },
    ].find((x) => x.stadio === 'COMPLETO' || x.stadio === 'PARZIALE');
    return { ...r, ...stato, tappeComplete, fase: raggiunta ? raggiunta.nome : ORDINE_FASI[0] };
  });

  // In testa chi è più avanti, poi per nome: il riepilogo serve a decidere, e
  // la prima domanda è «chi ha finito».
  return tutte.sort(
    (a, b) =>
      b.tappeComplete - a.tappeComplete || a.ragioneSociale.localeCompare(b.ragioneSociale, 'it')
  );
}

/**
 * DOVE SI APRE UNA POSIZIONE (0.250.0).
 *
 * Il riepilogo della dashboard mandava ogni azienda sulla scheda
 * `/aziende/[id]`: la vecchia scheda dello screening, con le tab Anagrafica e
 * Analisi Bilancio. Chi arrivava da «1. Verifica amministrativa» o da
 * «4. Scenari» finiva in un punto che non c'entrava, e doveva ricominciare a
 * cercare. Ora la riga porta dove la posizione si sta lavorando: la prima
 * tappa non chiusa, nell'ordine del lavoro.
 *
 * Se nulla è cominciato si apre il triage, che è la prima porta; quando le tre
 * verifiche sono chiuse si apre la verifica aziendale, che è la fotografia
 * completa della posizione — anche se gli scenari mancano, perché è lì che si
 * legge insieme tutto il resto.
 */
export function hrefPosizione(p: AvanzamentoPosizione, codice: string): string {
  const base = `/spazio/${codice}`;
  if (p.aziendaId === null) return `${base}/scenari`;
  const id = p.aziendaId;

  // Una tappa cominciata vince sull'ordine: è lì che si sta lavorando.
  if (p.contabile === 'PARZIALE') return `${base}/verifica-contabile/${id}`;
  if (p.aziendale === 'PARZIALE') return `${base}/verifica-azienda/${id}`;

  if (p.amministrativa !== 'COMPLETO') return `${base}/verifica-salute?azienda=${id}`;
  // «Non disponibile» non è «mancante»: a un accesso che non legge la
  // contabile non si manda la riga su una pagina che gli risponderà 403.
  if (p.contabile === 'MANCANTE') return `${base}/verifica-contabile/${id}`;
  // Chiusa la contabile non resta che la verifica aziendale: sia che manchi
  // sia che sia completa, è lì che la posizione si legge.
  return `${base}/verifica-azienda/${id}`;
}

/** Quante posizioni sono arrivate a ciascuna fase, per il conteggio in testa. */
export function conteggioFasi(
  posizioni: AvanzamentoPosizione[]
): { fase: string; quante: number }[] {
  return ORDINE_FASI.map((fase) => ({
    fase,
    quante: posizioni.filter((p) => p.fase === fase).length,
  }));
}
