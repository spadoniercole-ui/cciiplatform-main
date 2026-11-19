// src/lib/debitiEnte/types.ts
//
// IL DEBITO VERSO L'ENTE — il contratto del dato.
//
// Il debito dell'ente non è una nozione del Piano-ponte: nasce dalla verifica
// amministrativa (certificazione dei debiti o posizioni del triage) e da lì
// arriva alla contabile, alla memorizzazione e al Ponte. Per questo il suo
// tipo vive qui, in `lib/debitiEnte`, e il Ponte lo importa — non il contrario.

export interface DebitoEntePonte {
  /** Contabilizzato + da contabilizzare: il debito certo che il Ponte usa. */
  totale: number;
  contributi: number;
  sanzioni: number;
  creditiAgente: number;
  /** Posizioni che formano il totale. */
  righe: number;
  /**
   * Il dettaglio dei tre stati. Presente nei Ponte calcolati da 0.178.0;
   * assente nelle versioni salvate prima, che restano leggibili.
   */
  contabilizzato?: number;
  daContabilizzare?: number;
  /** Posizioni segnalate alle unità operative, fuori dal totale. */
  segnalato?: number;
  righeSegnalate?: number;
  /**
   * Le posizioni del triage non hanno il riparto contributi/sanzioni: lo zero
   * di `sanzioni` è un'assenza dichiarata, non una misura.
   */
  sanzioniNonDistinte?: boolean;
  /**
   * Da dove viene lo snapshot: la certificazione dei debiti, oppure le
   * posizioni del triage quando la prima non è arrivata alla posizione
   * dell'azienda. La scheda lo dichiara, così la cifra non è anonima.
   */
  fonte: string;
}
