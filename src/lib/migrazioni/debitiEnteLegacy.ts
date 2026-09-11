// src/lib/migrazioni/debitiEnteLegacy.ts
//
// Quando rinominare `debiti_ente` in `debiti_ente_per_scenario_legacy`.
//
// Sembra una condizione da due righe, ed è il punto in cui questo progetto si
// è già fatto male una volta: vale la pena averla isolata e coperta.
//
// STORIA, perché la regola si capisca.
// La Situazione Debitoria era per SCENARIO; è stata spostata su AZIENDA, e la
// migrazione rinominava la vecchia tabella come archivio. Dalla 0.109.58 è
// tornata nello scenario, e `debiti_ente` ha di nuovo una colonna
// `scenario_id`.
//
// Il guaio: la presenza di `scenario_id` era il SEGNALE che faceva scattare
// la migrazione. Rimettendo la colonna, su ogni database già migrato la
// vecchia migrazione ripartiva e tentava di rinominare in una tabella che
// esiste già, fallendo con
//   relation "debiti_ente_per_scenario_legacy" already exists
// L'errore faceva cadere OGNI operazione che passa da lì — fra cui il calcolo
// dell'indicatore di attenzione, che restava "non calcolabile" senza dire il
// perché.
//
// La regola corretta: la tabella legacy è la prova che la migrazione è già
// avvenuta. Se c'è, non si tocca nulla.

export function deveRinominareInLegacy(
  /** `debiti_ente` ha una colonna scenario_id? */
  haScenarioId: boolean,
  /** La tabella legacy esiste già? */
  legacyEsiste: boolean
): boolean {
  return haScenarioId && !legacyEsiste;
}
