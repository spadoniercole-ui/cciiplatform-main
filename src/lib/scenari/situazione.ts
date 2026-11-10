// LA SITUAZIONE CAMBIA, I PASSI VANNO RIGUARDATI (0.189.0).
//
// Cambiare la situazione non è correggere un'etichetta: è cambiare l'atto che
// si sta valutando. Il dato già compilato non si cancella — sarebbe una
// perdita silenziosa — ma non si presume più che appartenga all'atto nuovo.
// Lo scenario torna in bozza e la scheda dice che cosa riguardare.
//
// Logica pura: chi legge il database sta in passiCompilati.ts.

import type { TipoAttoGiudice } from '@/lib/giudice/lettura';

/** Lo stesso messaggio per l'azione e per chi legge uno scenario bloccato. */
export const MESSAGGIO_SCENARIO_BLOCCATO =
  'Questo scenario è in sola lettura permanente — la Relazione finale è già stata generata. Per una nuova valutazione, apri un nuovo scenario — oppure, se serve correggere un errore su questo, l’Admin di Spazio può sbloccarlo qui sotto.';

/**
 * L'origine che discende dalla situazione, per uno spazio ENTE.
 *
 * L'ente non redige proposte: le riceve. Se valuta un accordo transattivo,
 * l'atto arriva dall'azienda; se valuta un decreto o un cram down, arriva dal
 * tribunale. Per un redigente l'origine è una sua scelta e resta com'è.
 */
export function originePerSituazione(
  ente: boolean,
  tipo: TipoAttoGiudice
): 'Azienda' | 'Tribunale' | undefined {
  if (!ente) return undefined;
  return tipo === 'PROPOSTA' ? 'Azienda' : 'Tribunale';
}

export interface PassiCompilati {
  /** Righe di proposta_creditori già inserite sullo scenario. */
  propostaRighe: number;
  /** Risposte di Check List già date (non le domande lasciate vuote). */
  risposteChecklist: number;
}

/**
 * Che cosa va rivisto dopo il cambio, in italiano e con i numeri veri.
 *
 * Solo i passi che dipendono dall'atto: la proposta (creditori e percentuali)
 * e la Check List (le risposte erano date per quell'atto). Indici, XBRL e
 * contabile non cambiano con la situazione e non si elencano.
 */
export function passiDaRivedere(passi: PassiCompilati): string[] {
  const daRivedere: string[] = [];
  if (passi.propostaRighe > 0) {
    daRivedere.push(
      `Proposta: ${passi.propostaRighe} ${passi.propostaRighe === 1 ? 'riga di creditori' : 'righe di creditori'} da ricontrollare`
    );
  }
  if (passi.risposteChecklist > 0) {
    daRivedere.push(
      `Check List: ${passi.risposteChecklist} ${passi.risposteChecklist === 1 ? 'risposta' : 'risposte'} da riconfermare`
    );
  }
  return daRivedere;
}

/** La data in forma italiana, per gli avvisi. */
export function dataItaliana(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleDateString('it-IT');
}
