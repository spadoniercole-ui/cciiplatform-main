// LA VALUTAZIONE COMPLETA PARTE DAL DATO CONTABILE, NON DAL PONTE (0.248.0).
//
// Fino alla 0.247.0 la valutazione completa dell'ente non partiva senza il
// Piano-ponte: il ponte portava il bilancio storico alla Data verifica, e senza
// quella base contabile l'analisi avrebbe confrontato un'altra fotografia. Il
// vincolo però legava una funzione nuova a una vecchia: chi non aveva calcolato
// il ponte non poteva usare la valutazione, anche con i bilanci in archivio e
// la contabile pronta.
//
// Ora la condizione è il dato contabile: la valutazione parte quando c'è almeno
// un bilancio XBRL, che è la base che la contabile nuova (il prospetto
// proiettato) sa leggere. L'operatore può comunque procedere senza, ma deve
// dichiararlo: l'assenza resta scritta nella relazione, non passa in silenzio.
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
