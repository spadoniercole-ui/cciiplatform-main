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

// ---------------------------------------------------------------------------
// Limiti QUANTITATIVI della generazione Screening: quante direttrici, quanti
// prodotti per direttrice, quante domande totali il questionario può avere.
// Servono a evitare "report monstre" (e il relativo consumo di token): sono
// forzati nel prompt AND nel materiale passato al modello.
// ---------------------------------------------------------------------------

export const SCREENING_MAX_DOMANDE_DEFAULT = 20;
export const SCREENING_MAX_DOMANDE_MIN = 5;
export const SCREENING_MAX_DOMANDE_LIMITE = 60;

export const SCREENING_MAX_DIRETTRICI_DEFAULT = 8;
export const SCREENING_MAX_DIRETTRICI_MIN = 1;
export const SCREENING_MAX_DIRETTRICI_LIMITE = 20;

export const SCREENING_MAX_PRODOTTI_DEFAULT = 5;
export const SCREENING_MAX_PRODOTTI_MIN = 1;
export const SCREENING_MAX_PRODOTTI_LIMITE = 15;

function clamp(grezzo: number | null | undefined, def: number, min: number, max: number): number {
  if (grezzo === null || grezzo === undefined || Number.isNaN(grezzo)) return def;
  return Math.min(max, Math.max(min, Math.trunc(grezzo)));
}

export function normalizzaMaxDomande(grezzo: number | null | undefined): number {
  return clamp(
    grezzo,
    SCREENING_MAX_DOMANDE_DEFAULT,
    SCREENING_MAX_DOMANDE_MIN,
    SCREENING_MAX_DOMANDE_LIMITE
  );
}
export function normalizzaMaxDirettrici(grezzo: number | null | undefined): number {
  return clamp(
    grezzo,
    SCREENING_MAX_DIRETTRICI_DEFAULT,
    SCREENING_MAX_DIRETTRICI_MIN,
    SCREENING_MAX_DIRETTRICI_LIMITE
  );
}
export function normalizzaMaxProdotti(grezzo: number | null | undefined): number {
  return clamp(
    grezzo,
    SCREENING_MAX_PRODOTTI_DEFAULT,
    SCREENING_MAX_PRODOTTI_MIN,
    SCREENING_MAX_PRODOTTI_LIMITE
  );
}
