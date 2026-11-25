// I COLORI DEI DATI (0.256.30).
//
// Un colore è un'informazione: verde se il valore è favorevole, rosso se è
// sfavorevole, arancione se è neutro. Il grigio non è una quarta opinione: è
// il colore UNICO di quando il valore non si riesce a interpretare (dato
// assente, oppure numero che non ha un verso — zero). Così due barre grigie
// dicono la stessa cosa, e non si confondono con «neutro».
//
// Sta in un modulo suo perché la stessa regola la usano il ritratto aziendale,
// l'esito della verifica contabile e i grafici delle dimensioni: tre copie
// divergerebbero al primo ritocco.

export type TonoDato = 'positivo' | 'negativo' | 'neutro' | 'nonInterpretabile';

/** Il tono di un valore: assente → grigio; sfavorevole → rosso; positivo → verde. */
export function tonoDelDato(input: { valore: number | null; segnala?: boolean }): TonoDato {
  if (input.valore === null || !Number.isFinite(input.valore)) return 'nonInterpretabile';
  if (input.segnala) return 'negativo';
  if (input.valore < 0) return 'negativo';
  if (input.valore > 0) return 'positivo';
  return 'neutro';
}

/**
 * Il tono di una dimensione: l'intensità non è un valore con un segno, è
 * quanto pesa. Zero non è «neutro», è «non misurata»; oltre la metà è il fatto
 * sfavorevole; in mezzo resta neutra.
 */
export function tonoDellIntensita(punteggio: number): TonoDato {
  if (!Number.isFinite(punteggio) || punteggio <= 0) return 'nonInterpretabile';
  return punteggio >= 50 ? 'negativo' : 'neutro';
}

/** Le classi Tailwind del testo e della barra, per tono. */
export const TESTO_TONO: Record<TonoDato, string> = {
  positivo: 'text-emerald-700',
  negativo: 'text-red-700',
  neutro: 'text-amber-800',
  nonInterpretabile: 'text-slate-500',
};

export const BARRA_TONO: Record<TonoDato, string> = {
  positivo: 'bg-emerald-400',
  negativo: 'bg-red-400',
  neutro: 'bg-amber-400',
  nonInterpretabile: 'bg-slate-300',
};
