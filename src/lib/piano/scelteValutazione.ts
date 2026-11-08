// Le scelte dell'istruttore prima di avviare la valutazione: quale piano
// entra nel giudizio, se il piano dell'azienda va incluso e se il confronto
// tra piani deve comparire nella relazione finale. La forma è una sola perché
// la scrive il browser, la rilegge la sintesi e la usa l'analisi AI.

export interface PianoDisponibile {
  chiave: string;
  nome: string;
  tipo: 'azienda' | 'base' | 'ai' | 'variante';
}

export interface SceltePianoValutazione {
  includiPianoAziendale: boolean;
  pianoScelto: string | null;
  includiConfronto: boolean;
  pianiConfronto: string[];
}

export const SCELTE_PIANO_PREDEFINITE: SceltePianoValutazione = {
  includiPianoAziendale: true,
  pianoScelto: 'base',
  includiConfronto: true,
  pianiConfronto: [],
};

const chiaviValide = new Set(['azienda', 'base', 'elaborazione-ai']);

/** Pulizia di ciò che arriva dal browser o dal database. */
export function sceltePianoPulite(v: unknown): SceltePianoValutazione | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const pianoScelto =
    typeof o.pianoScelto === 'string' && o.pianoScelto.trim()
      ? o.pianoScelto.trim().slice(0, 80)
      : null;
  const pianiConfronto = Array.isArray(o.pianiConfronto)
    ? Array.from(
        new Set(
          o.pianiConfronto
            .filter((x): x is string => typeof x === 'string')
            .map((x) => x.trim().slice(0, 80))
            .filter(Boolean)
        )
      ).slice(0, 20)
    : [];
  return {
    includiPianoAziendale: o.includiPianoAziendale !== false,
    pianoScelto: pianoScelto ?? (chiaviValide.has('base') ? 'base' : null),
    includiConfronto: o.includiConfronto !== false,
    pianiConfronto,
  };
}

export function etichettaPiano(chiave: string | null | undefined): string {
  if (!chiave) return 'nessun piano scelto';
  if (chiave === 'azienda') return 'piano dell’azienda';
  if (chiave === 'base') return 'piano base della piattaforma';
  if (chiave === 'elaborazione-ai') return 'piano elaborato dall’AI';
  return `variante «${chiave}»`;
}
