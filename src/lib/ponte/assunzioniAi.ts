// src/lib/ponte/assunzioniAi.ts
//
// L'AI PROPONE, IL MOTORE CALCOLA.
//
// Questo modulo non conosce il database e non produce un Ponte: trasforma la
// risposta del modello in un elenco di assunzioni candidate, validate contro
// gli stessi intervalli del motore. Una proposta senza motivazione o fuori
// scala viene scartata e dichiarata: non si lascia passare un numero solo
// perché è scritto in JSON.

import type { InputPonte, AssunzionePonte } from './types';
import { istruzioniLessicoPerPrompt } from '@/lib/lessico/lessico';

export const PROMPT_VERSIONE = 'ponte-assunzioni-1.0.0';

export interface PropostaAssunzioniAi {
  assunzioni: AssunzionePonte[];
  sintesi: string;
  datiMancanti: string[];
  avvisi: string[];
  scartate: string[];
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

export function promptAssunzioniPonte(input: InputPonte, base: AssunzionePonte[]): string {
  const storico = input.esercizi.slice(-3).map((e) => ({
    anno: e.anno,
    dati: e.dati,
  }));
  const note = input.note.slice(0, 8).map((n) => ({
    tag: n.tagPulito,
    testo: n.testo.slice(0, 1200),
  }));
  const visura = input.visura
    ? {
        denominazione: input.visura.denominazione,
        formaGiuridica: input.visura.formaGiuridica,
        statoAttivita: input.visura.statoAttivita,
        procedureConcorsuali: input.visura.procedureConcorsuali,
        attiRilevanti: input.visura.attiRilevanti,
      }
    : null;
  const debito = input.debitoEnte
    ? {
        totale: input.debitoEnte.totale,
        contributi: input.debitoEnte.contributi,
        sanzioni: input.debitoEnte.sanzioni,
        righe: input.debitoEnte.righe,
      }
    : input.debitoEnteDichiaratoZero
      ? { totale: 0, dichiaratoZero: true }
      : null;

  return `Sei un analista contabile che assiste un ente creditore pubblico. Devi proporre le assunzioni per un Piano-ponte che porta l'ultimo bilancio XBRL alla Data verifica. Non devi calcolare il Ponte: i numeri li calcola il motore deterministico della piattaforma.

DATI DISPONIBILI
- Data verifica: ${input.dataRiferimento}
- Storico XBRL (massimo tre esercizi): ${JSON.stringify(storico)}
- Note integrative: ${JSON.stringify(note)}
- Visura: ${JSON.stringify(visura)}
- Debito ente: ${JSON.stringify(debito)}
- Settore: ${JSON.stringify(input.settore)}
- Assunzioni già ricavate dal motore: ${JSON.stringify(base)}

RISPONDI SOLO CON UN OGGETTO JSON, senza testo fuori dal JSON:
{
  "assunzioni": [
    {
      "codice": "crescitaRicavi" | "margineEbitda" | "giorniIncasso" | "giorniPagamento" | "investimentiMantenimento" | "aliquotaImposte" | "costoDebito",
      "valore": number,
      "motivazione": "perché questo valore, con il riferimento alla nota o al dato usato"
    }
  ],
  "sintesi": "massimo 1200 caratteri: cosa cambia e quali sono i dati mancanti",
  "datiMancanti": ["..."],
  "avvisi": ["..."]
}

REGOLE
1. Proponi solo assunzioni che puoi motivare con i dati sopra; cita il tag della nota o il dato XBRL.
2. Non inventare ricavi, costi, cassa, debito totale, recupero o percentuali di realizzo. Non scrivere un piano economico.
3. Rispetta gli intervalli delle assunzioni già ricavate dal motore. Se un valore è fuori intervallo, non proporlo.
4. Non qualificare la crisi, l'insolvenza o il cram down; non dare conclusioni legali. Parla di ipotesi da verificare.
5. Se un dato manca, dichiaralo in "datiMancanti" invece di stimarlo.
${istruzioniLessicoPerPrompt()}`;
}

export function validaPropostaAi(grezzo: unknown, base: AssunzionePonte[]): PropostaAssunzioniAi {
  const g = grezzo && typeof grezzo === 'object' ? (grezzo as Record<string, unknown>) : {};
  const perCodice = new Map(base.map((a) => [a.codice, a]));
  const assunzioni: AssunzionePonte[] = [];
  const scartate: string[] = [];
  const viste = new Set<string>();

  for (const raw of Array.isArray(g.assunzioni) ? g.assunzioni : []) {
    const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const codice = str(r.codice ?? r.chiave, 80);
    const originale = perCodice.get(codice as AssunzionePonte['codice']);
    if (!codice || !originale) {
      scartate.push(`assunzione sconosciuta: ${codice ?? 'senza codice'}`);
      continue;
    }
    if (viste.has(codice)) {
      scartate.push(`${codice}: proposta ripetuta, tenuta la prima`);
      continue;
    }
    const valore = num(r.valore);
    if (valore === null) {
      scartate.push(`${codice}: valore non numerico`);
      continue;
    }
    if (originale.intervallo) {
      const [min, max] = originale.intervallo;
      if (valore < min || valore > max) {
        scartate.push(`${codice}: ${valore} fuori dall'intervallo ${min}–${max}`);
        continue;
      }
    }
    const motivazione = str(r.motivazione, 900);
    if (!motivazione) {
      scartate.push(`${codice}: manca la motivazione`);
      continue;
    }
    viste.add(codice);
    assunzioni.push({
      ...originale,
      valore: Math.round(valore * 100) / 100,
      fonte: 'stimata',
      motivazione,
    });
  }

  const lista = (v: unknown, max: number): string[] =>
    Array.isArray(v)
      ? v
          .map((x) => str(x, 400))
          .filter((x): x is string => !!x)
          .slice(0, max)
      : [];

  return {
    assunzioni,
    sintesi: str(g.sintesi, 2000) ?? 'Nessuna sintesi proposta dall’AI.',
    datiMancanti: lista(g.datiMancanti, 12),
    avvisi: lista(g.avvisi, 12),
    scartate,
  };
}
