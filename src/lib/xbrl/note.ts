// src/lib/xbrl/note.ts
//
// LE NOTE INTEGRATIVE SONO TESTO, NON NUMERI.
//
// Una tassonomia ITCC-CI mette la nota integrativa dentro fact testuali con
// l'HTML dentro (`&lt;p style=...&gt;`): prenderli così come arrivano significa
// portare nel prompt del Piano-ponte migliaia di caratteri di `margin:0cm`,
// e perdere per strada ciò che conta — continuità aziendale, fatti di rilievo
// dopo la chiusura, impegni, parti correlate.
//
// Qui si fa una cosa sola e la si fa per tutti: si ripulisce il testo, si
// assegna ogni nota a una sezione e si tengono le sezioni rilevanti entro un
// tetto dichiarato. Il taglio è sempre dichiarato (`troncate`), mai silenzioso.

import type { FactTestuale } from './types';

/** Le sezioni che il Piano-ponte sa leggere. `ALTRO` è ciò che resta. */
export type SezioneNota =
  | 'CONTINUITA'
  | 'FATTI_RILIEVO'
  | 'IMPEGNI'
  | 'PARTI_CORRELATE'
  | 'EVENTI_STRAORDINARI'
  | 'PIANI'
  | 'CRITERI'
  | 'ALTRO';

export interface NotaConSezione extends FactTestuale {
  sezione: SezioneNota;
}

export interface SezioneRiepilogo {
  sezione: SezioneNota;
  fatti: number;
  caratteri: number;
}

export interface NoteSelezionate {
  fatti: NotaConSezione[];
  sezioni: SezioneRiepilogo[];
  caratteri: number;
  /** true se un tetto ha ridotto il testo: si dichiara, non si tace. */
  troncate: boolean;
  /** Testi scartati: etichette troppo brevi, duplicati, fuori dai tetti. */
  scartati: number;
}

const ENTITA: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  euro: '€',
};

function decodificaEntita(testo: string): string {
  return testo.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (intero, gruppo: string) => {
    const nome = gruppo.toLowerCase();
    if (nome.startsWith('#x')) {
      const codice = parseInt(nome.slice(2), 16);
      return Number.isFinite(codice) && codice > 0 && codice <= 0x10ffff
        ? String.fromCodePoint(codice)
        : intero;
    }
    if (nome.startsWith('#')) {
      const codice = parseInt(nome.slice(1), 10);
      return Number.isFinite(codice) && codice > 0 && codice <= 0x10ffff
        ? String.fromCodePoint(codice)
        : intero;
    }
    return ENTITA[nome] ?? intero;
  });
}

/**
 * Il testo di una nota come lo leggerebbe una persona: entità risolte, tag
 * HTML tolti, spazi compattati. La doppia decodifica serve ai file reali, dove
 * l'HTML è a sua volta codificato (`&amp;nbsp;`).
 */
export function testoSemplice(testo: string): string {
  if (!testo) return '';
  let t = decodificaEntita(testo);
  t = t.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ');
  t = t.replace(/<[^>]*>/g, ' ');
  t = decodificaEntita(t);
  return t.replace(/\s+/g, ' ').trim();
}

function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const REGOLE: { sezione: SezioneNota; rx: RegExp }[] = [
  {
    sezione: 'CONTINUITA',
    // «continuità aziendale» è la sezione che cambia le assunzioni: va letta
    // per prima. `going concern` è la formula inglese dei file esteri.
    rx: /continuita|goingconcern|going concern|prospettic|presuppostodel|sopravvivenz|sciogliment/,
  },
  {
    sezione: 'PARTI_CORRELATE',
    rx: /particorrelat|particorrel|compensiamministratori|compensidegliamministratori/,
  },
  {
    sezione: 'IMPEGNI',
    rx: /passivita|potenzial|impegn|fideiussion|garanzi|ipotech|pegno|contenzios/,
  },
  {
    sezione: 'FATTI_RILIEVO',
    rx: /fattidirilievo|successivi|dopola chiusura|dopochiusura|chiusuradellesercizio|fattieccezional/,
  },
  {
    sezione: 'EVENTI_STRAORDINARI',
    rx: /straordinari|catastrof|calamita|terremot|alluvion|pandemi|incend|esondazion/,
  },
  {
    sezione: 'PIANI',
    rx: /pian|intenzion|programm|budget|prevision|investiment|rinnovo|riorganizzazion/,
  },
  {
    sezione: 'CRITERI',
    rx: /criteri|principi|redazione|valutazion|conformita|derog|compensazion|introduzion|notaintegrativa/,
  },
];

/** A quale sezione appartiene una nota. Il tag pesa più del testo. */
export function sezioneNota(f: Pick<FactTestuale, 'tagPulito' | 'testo'>): SezioneNota {
  const tag = normalizza(f.tagPulito ?? '');
  const testo = normalizza(f.testo ?? '');
  for (const r of REGOLE) if (r.rx.test(tag)) return r.sezione;
  for (const r of REGOLE) if (r.rx.test(testo)) return r.sezione;
  return 'ALTRO';
}

/** L'ordine in cui le sezioni si tengono quando il tetto taglia. */
const PRIORITA: Record<SezioneNota, number> = {
  CONTINUITA: 1,
  FATTI_RILIEVO: 2,
  IMPEGNI: 3,
  PARTI_CORRELATE: 4,
  EVENTI_STRAORDINARI: 5,
  PIANI: 6,
  CRITERI: 7,
  ALTRO: 8,
};

export function prioritaSezione(sezione: SezioneNota): number {
  return PRIORITA[sezione];
}

export interface OpzioniNote {
  massimoFatti?: number;
  caratteriPerFatto?: number;
  caratteriTotali?: number;
  minimoCaratteri?: number;
}

/**
 * Tetti del primo taglio. Un'istanza reale porta decine di testi e centinaia di
 * migliaia di caratteri: al Piano-ponte servono le sezioni che cambiano le
 * assunzioni, e una citazione che si possa leggere.
 */
export const LIMITI_NOTE = {
  massimoFatti: 40,
  caratteriPerFatto: 6_000,
  caratteriTotali: 48_000,
  minimoCaratteri: 80,
} as const;

/**
 * Seleziona le note da conservare: ripulite, senza duplicati, ordinate per
 * priorità di sezione quando il tetto taglia, restituite nell'ordine di
 * lettura del file (così la citazione resta al suo posto).
 */
export function selezionaNote(fatti: FactTestuale[], opzioni: OpzioniNote = {}): NoteSelezionate {
  const limiti = { ...LIMITI_NOTE, ...opzioni };
  let troncate = false;

  const visti = new Set<string>();
  const candidati: NotaConSezione[] = [];

  for (const f of fatti) {
    const testo = testoSemplice(f.testo);
    if (testo.length < limiti.minimoCaratteri) continue;
    const chiave = normalizza(testo.slice(0, 160));
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    if (testo.length > limiti.caratteriPerFatto) troncate = true;
    candidati.push({
      ...f,
      sezione: sezioneNota(f),
      testo: testo.slice(0, limiti.caratteriPerFatto),
    });
  }

  const perPriorita = [...candidati].sort(
    (a, b) => prioritaSezione(a.sezione) - prioritaSezione(b.sezione) || a.ordine - b.ordine
  );

  const scelti: NotaConSezione[] = [];
  let caratteri = 0;
  for (const f of perPriorita) {
    if (scelti.length >= limiti.massimoFatti) {
      troncate = true;
      break;
    }
    if (caratteri + f.testo.length > limiti.caratteriTotali) {
      troncate = true;
      continue;
    }
    scelti.push(f);
    caratteri += f.testo.length;
  }

  scelti.sort((a, b) => a.ordine - b.ordine);

  const perSezione = new Map<SezioneNota, SezioneRiepilogo>();
  for (const f of scelti) {
    const voce = perSezione.get(f.sezione) ?? { sezione: f.sezione, fatti: 0, caratteri: 0 };
    voce.fatti += 1;
    voce.caratteri += f.testo.length;
    perSezione.set(f.sezione, voce);
  }
  const sezioni = [...perSezione.values()].sort(
    (a, b) => prioritaSezione(a.sezione) - prioritaSezione(b.sezione)
  );

  return {
    fatti: scelti,
    sezioni,
    caratteri,
    troncate,
    scartati: fatti.length - scelti.length,
  };
}
