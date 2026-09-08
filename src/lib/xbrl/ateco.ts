// src/lib/xbrl/ateco.ts
//
// Il campo ATECO nei file XBRL reali (tag itcc-ci:DatiAnagrafici
// SettoreAttivitaPrevalenteAteco) contiene tipicamente una descrizione
// testuale con il codice tra parentesi in fondo, es. "Altri servizi di
// logistica (52.25.09)" — non il codice pulito XX.XX.XX. Prendere quella
// stringa intera come "codice ATECO" produce sempre un formato sbagliato.
// Questa funzione estrae solo il codice, tollerante anche al caso in cui
// il campo contenga già solo il codice pulito.

const REGEX_CODICE_TRA_PARENTESI = /\(\s*(\d{2}(?:\.\d{1,2}){0,2})\s*\)\s*$/;
const REGEX_CODICE_PULITO = /^\d{2}(?:\.\d{1,2}){0,2}$/;

/** Restituisce il codice ATECO normalizzato (XX.XX.XX) da un testo grezzo XBRL, o null se non riconoscibile. */
export function estraiCodiceAteco(testoGrezzo: string | null | undefined): string | null {
  if (!testoGrezzo) return null;
  const pulito = testoGrezzo.trim();
  if (!pulito) return null;

  // Caso più comune nei file reali: descrizione + "(XX.XX.XX)" in fondo.
  const matchParentesi = pulito.match(REGEX_CODICE_TRA_PARENTESI);
  if (matchParentesi) return matchParentesi[1];

  // Il campo contiene già solo il codice.
  if (REGEX_CODICE_PULITO.test(pulito)) return pulito;

  return null;
}
