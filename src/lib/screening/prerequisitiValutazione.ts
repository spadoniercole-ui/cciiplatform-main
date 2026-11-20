// LA VALUTAZIONE COMPLETA PARTE DAL DATO CONTABILE (0.248.0).
//
// Senza una base contabile l'analisi confronterebbe un'altra fotografia: il
// bilancio storico va portato alla Data verifica, ed è quello che fa la
// contabile nuova (il prospetto proiettato). Il vincolo però non può legare
// una funzione nuova a un passaggio in più: chi ha i bilanci in archivio e la
// contabile pronta deve poter partire, senza dover prima calcolare altro.
//
// La condizione è quindi la presenza del dato contabile: la valutazione parte
// quando c'è almeno un bilancio XBRL, che è la base che la contabile sa
// leggere. L'operatore può comunque procedere senza, ma deve dichiararlo:
// l'assenza resta scritta nella relazione, non passa in silenzio.
//
// La regola sta qui, pura, così l'azione e la schermata dicono la stessa cosa.

export type TipoSpazioValutazione = 'ENTE' | 'NON_ENTE';
export type OrigineValutazione = 'AUTOMATICA' | 'MANUALE';

export const MESSAGGIO_CONTABILE_MANCANTE =
  'La valutazione completa parte dal dato contabile: carica almeno un bilancio XBRL in «Bilanci XBRL» della scheda azienda. Se il bilancio non c’è, spunta «Procedi senza bilancio XBRL»: l’assenza verrà evidenziata nella relazione.';

export interface CondizioniValutazione {
  tipoSpazio: TipoSpazioValutazione;
  /** MANUALE = lancio dalla scheda; AUTOMATICA = al salvataggio dei parametri. */
  origine: OrigineValutazione;
  /** Annualità XBRL in archivio per l'azienda. */
  anniContabile: number;
  /** L'operatore ha dichiarato di procedere senza il bilancio. */
  senzaBilancio: boolean;
}

export interface EsitoCondizioni {
  puo: boolean;
  motivo: string | null;
}

/**
 * Si può lanciare la valutazione completa?
 *
 * Il vincolo vale per il lancio dalla scheda di un ente: la prima elaborazione
 * automatica al salvataggio dei parametri resta possibile, perché avviene nel
 * triage e non ha un operatore davanti che possa caricare un bilancio.
 */
export function puoValutareCompleta(input: CondizioniValutazione): EsitoCondizioni {
  if (input.tipoSpazio !== 'ENTE' || input.origine === 'AUTOMATICA') {
    return { puo: true, motivo: null };
  }
  if (input.anniContabile > 0 || input.senzaBilancio) {
    return { puo: true, motivo: null };
  }
  return { puo: false, motivo: MESSAGGIO_CONTABILE_MANCANTE };
}
