// LA PERDITA STIMATA QUANDO IL PROVVEDIMENTO NON C'È ANCORA.
//
// Con il flag di simulazione lo scenario lavora sui dati che ha già: la
// posizione accertata nella verifica amministrativa e le percentuali fissate
// dall'ente nei parametri. Da lì si ricava un recupero atteso e, per
// differenza, la perdita rispetto al credito vantato — la stessa evidenza che
// il confronto col provvedimento produce quando l'atto arriva.
//
// Non è una lettura dell'atto e non la sostituisce: è una stima parametrica,
// dichiarata come tale, che serve a lavorare prima del deposito. Quando il
// provvedimento arriva, i suoi numeri prendono il posto di questi.
//
// Logica pura: nessun accesso al database, nessun arrotondamento inventato.

import { scenariPerClasse, type RigaDaClassificare } from '@/lib/debitiEnte/classificazioneCredito';
import type { ParametriScenari } from '@/lib/triage/scenari';

export type TipoStima = 'DECRETO_LIQUIDAZIONE' | 'CRAM_DOWN';

export interface StimaSenzaProvvedimento {
  tipo: TipoStima;
  /** Il credito vantato che si riesce a collocare (quote classificate). */
  credito: number;
  /** Il credito che il documento non permette di collocare: dichiarato, fuori dai conti. */
  escluso: number;
  /** Quanto l'ente incasserebbe con le percentuali dei parametri; null se non calcolabile. */
  recupero: number | null;
  /** credito − recupero; null quando il recupero non è calcolabile. */
  perdita: number | null;
  /** La perdita in percentuale del credito vantato. */
  perditaPct: number | null;
  /** Perché il recupero non è calcolabile (percentuali mancanti). */
  mancanti: string[];
}

const centesimi = (n: number) => Math.round(n * 100) / 100;

export function stimaSenzaProvvedimento(
  righe: RigaDaClassificare[],
  parametri: ParametriScenari,
  tipo: TipoStima
): StimaSenzaProvvedimento {
  const classi = scenariPerClasse(righe, parametri);
  const credito = centesimi(classi.quote.reduce((a, q) => a + q.importo, 0));
  const recupero = tipo === 'CRAM_DOWN' ? classi.cramDown : classi.liquidazione;
  const perdita = recupero === null ? null : centesimi(credito - recupero);
  return {
    tipo,
    credito,
    escluso: classi.escluso,
    recupero,
    perdita,
    perditaPct: perdita === null || credito <= 0 ? null : centesimi((perdita / credito) * 100),
    mancanti: classi.mancanti,
  };
}
