// src/lib/soglie25novies/sintesi.ts
//
// Da più righe di soglia a un solo esito: superata, non superata, o non
// determinabile.
//
// PERCHÉ NON È OVVIO. Uno spazio ENTE valuta UNA sola soglia, la propria: la
// sintesi è la riga stessa. Il REDIGENTE le valuta tutte e quattro — deve
// sapere se l'impresa rischia la segnalazione da INPS, INAIL, Agenzia delle
// Entrate o Agente della Riscossione — e con quattro righe la probabilità che
// almeno un dato manchi è alta.
//
// La prima stesura rendeva l'esito indeterminato appena UNA riga non era
// calcolabile. Per l'ente era indifferente; per il Redigente avrebbe prodotto
// "approfondimenti necessari" quasi sempre, cioè rumore — e avrebbe
// NASCOSTO una soglia effettivamente superata dietro la mancanza di un dato
// che riguardava un altro ente.
//
// LA REGOLA: un fatto accertato non si perde per una lacuna altrove.

export function sintetizzaSoglie(
  /** Quante righe si applicano a questa impresa. */
  applicabili: number,
  /** Quante risultano superate. */
  superate: number,
  /** Quante non sono determinabili per mancanza di dati. */
  nonDeterminabili: number
): boolean | null {
  // Nessuna riga applicabile: non c'è nulla da valutare.
  if (applicabili === 0) return null;
  // Una soglia superata è un FATTO: vale anche se altre restano da accertare.
  if (superate > 0) return true;
  // Nessuna superata, ma qualcosa manca: la risposta potrebbe stare proprio
  // nel dato mancante, quindi non si conclude.
  if (nonDeterminabili > 0) return null;
  return false;
}
