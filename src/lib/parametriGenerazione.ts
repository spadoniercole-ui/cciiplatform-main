// src/lib/parametriGenerazione.ts
//
// Parametri che governano la GENERAZIONE AI, per-spazio con default di
// sistema — stesso schema di src/lib/parametriPeriodi.ts.
//
// screening_max_tokens: tetto di token in OUTPUT per il questionario di
// Screening generato dall'AI. Con un tetto troppo basso il JSON del
// questionario veniva troncato a metà (parsing fallito) quando le
// direttrici/domande erano molte. Reso configurabile e forzato nella
// chiamata AI, così spazi con molte direttrici possono alzarlo.

export const SCREENING_MAX_TOKENS_DEFAULT = 12000;
export const SCREENING_MAX_TOKENS_MIN = 2000;
export const SCREENING_MAX_TOKENS_LIMITE = 24000;

/** Riporta un valore grezzo (da DB o input) nell'intervallo consentito;
 * null/assente/non valido → default di sistema. */
export function normalizzaScreeningMaxTokens(grezzo: number | null | undefined): number {
  if (grezzo === null || grezzo === undefined || Number.isNaN(grezzo)) {
    return SCREENING_MAX_TOKENS_DEFAULT;
  }
  return Math.min(
    SCREENING_MAX_TOKENS_LIMITE,
    Math.max(SCREENING_MAX_TOKENS_MIN, Math.trunc(grezzo))
  );
}
