// I NUMERI DELLA POSIZIONE DEMO, IN UN POSTO SOLO (0.243.0).
//
// La demo ricreata a mano mostrava la posizione di Tessitura Lario senza il
// debito accertato («credito non accertato»), mentre i test della composizione
// parlavano di 152.000 € di credito e 77.090 € di scoperto: due dataset che
// nessuno teneva allineati. Da qui in poi i numeri che la demo mostra e quelli
// che i test usano sono gli stessi, e un test di coerenza verifica che continuino
// a esserlo.
//
// Con il set a tre aziende (0.256.0) il credito non arriva più da una proposta:
// Tessitura si ferma alla contabile, e la fonte è la certificazione dei debiti,
// che coincide con la somma delle sue posizioni.
//
// Non sono dati di imprese reali: Tessitura Lario Demo è un'azienda fittizia
// del percorso demo (vedi `percorsoEnte.ts`).

export const NUMERI_POSIZIONE_DEMO = {
  ragioneSociale: 'Tessitura Lario Demo S.p.A.',
  /** Il credito dell'ente: la certificazione dei debiti della posizione demo. */
  credito: 152_000,
  /** Disponibilità liquide dell'ultimo bilancio demo. */
  disponibilita: 74_910,
  /** Flusso d'esercizio della fotografia demo. */
  flusso: 44_910,
  /** Quanto la cassa non copre: credito − disponibilità. */
  scoperto: 77_090,
  /** Il miglior recupero fra le procedure calcolabili (cram down). */
  recuperoMinimo: 30_400,
  /** La certificazione dei debiti: la fonte a monte, uguale al credito. */
  certificazione: 152_000,
} as const;
