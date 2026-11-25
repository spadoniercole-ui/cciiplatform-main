// LA POSIZIONE DEBITORIA CHE IL PROVVEDIMENTO TROVA GIÀ ACCERTATA.
//
// Per liquidazione e cram down il confronto non parte da ciò che si scrive
// nello scenario: parte dalla verifica amministrativa, che è la base di ogni
// scenario e si apre già con il debito accertato. Le voci però vivono in più
// archivi, in ordine di autorità:
//
//   1. le posizioni dell'azienda (`debiti_ente` a livello azienda) — quelle
//      che il triage e la certificazione alimentano;
//   2. le posizioni rimaste agganciate a uno scenario vecchio, che non si
//      sommano mai alle prime ma restano leggibili;
//   3. la certificazione dei debiti (`debiti_vera`), da cui la verifica
//      amministrativa ricava la posizione quando le posizioni non ci sono;
//   4. la cifra che la verifica ha concluso e memorizzato: un atto concluso
//      non si azzera perché le righe di dettaglio non sono state ricaricate.
//
// Guardare solo il primo archivio faceva dire «nessuna posizione accertata» a
// un'azienda la cui verifica amministrativa il debito lo aveva già prodotto.
//
// Logica pura: nessun accesso al database.

export interface VoceEnte {
  voce: string;
  importo: number;
}

export interface FontiVociEnte {
  /** Posizioni registrate per l'azienda. */
  azienda: VoceEnte[];
  /** Righe di scenario degli scenari anteriori. */
  scenario: VoceEnte[];
  /** Righe della certificazione dei debiti (contabilizzate o da contabilizzare). */
  certificazione: VoceEnte[];
  /** Totale concluso dalla verifica amministrativa, se c'è. */
  memorizzato: number | null;
}

/** La voce unica con cui si legge una cifra che non ha più il suo dettaglio. */
export const VOCE_DEBITO_ACCERTATO = 'Debito accertato nella verifica amministrativa';

function vociValide(righe: VoceEnte[]): VoceEnte[] {
  return righe
    .filter(
      (r) =>
        typeof r.importo === 'number' && Number.isFinite(r.importo) && Math.abs(r.importo) >= 0.005
    )
    .map((r) => ({ voce: String(r.voce), importo: r.importo }));
}

/**
 * Le voci da mettere accanto a quelle del giudice: il primo archivio che porta
 * qualcosa vince, e non si somma mai agli altri — sarebbe lo stesso debito due
 * volte. Senza righe resta la cifra memorizzata dalla verifica, dichiarata come
 * tale; senza nemmeno quella la posizione è assente, e il confronto sarà vuoto.
 */
export function vociEnteDaFonti(fonti: FontiVociEnte): VoceEnte[] {
  for (const archivio of [fonti.azienda, fonti.scenario, fonti.certificazione]) {
    const voci = vociValide(archivio);
    if (voci.length > 0) return voci;
  }
  const totale = fonti.memorizzato;
  if (totale !== null && Number.isFinite(totale) && Math.abs(totale) >= 0.005) {
    return [{ voce: VOCE_DEBITO_ACCERTATO, importo: totale }];
  }
  return [];
}
