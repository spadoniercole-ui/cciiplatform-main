// L'AGGANCIO TRA VERIFICA AMMINISTRATIVA E VERIFICA CONTABILE.
//
// L'amministrativa dice com'è l'azienda oggi: visura, prospetti dell'ente,
// debito diviso tra contabilizzato e da contabilizzare. La contabile lavora sul
// dato storico — visura e bilancio XBRL — ma non parte dal nulla: la visura è
// la stessa, e il debito splittato è la voce che entra nella definizione del
// dato contabile (chiude il passivo patrimoniale con l'esposizione vera verso
// l'ente). Senza quei due dati la contabile si spunta su un'azienda che non
// conosce, e la scheda non può dire di che cosa sta parlando.
//
// Questo modulo è l'unico posto dove la regola è scritta: prende ciò che esiste
// (visura, certificazione dei debiti, posizioni del triage, anni di bilancio) e
// dice se la contabile è agganciabile — e se non lo è, che cosa manca. Non
// legge il database e non inventa: la lettura sta nella server action.

import type { SnapshotDebitoEnte } from '@/lib/ponte/debitoEnte';
import type { DebitoEntePonte } from '@/lib/ponte/types';

export interface DebitoContabile {
  contabilizzato: number;
  daContabilizzare: number;
  segnalato: number;
  totale: number;
  righe: number;
  fonte: string;
  /**
   * true quando il dato distingue contabilizzato e da contabilizzare. Le
   * posizioni del triage e quelle segnalate alle unità operative non hanno la
   * ripartizione: la cifra c'è, lo stato no — e la scheda lo deve dire invece
   * di mostrare due zeri come se fossero una misura.
   */
  ripartito: boolean;
}

export interface VisuraContabile {
  presente: boolean;
  nomeFile: string | null;
  /** Giorno del caricamento, in ISO (YYYY-MM-DD), o null. */
  caricataIl: string | null;
}

export interface AggancioContabile {
  visura: VisuraContabile;
  debito: DebitoContabile | null;
  /** Anni di bilancio XBRL disponibili sull'azienda, dal più recente. */
  anniBilancio: number[];
  /** Che cosa impedisce di spuntare la contabile, in italiano e senza codici. */
  mancanti: string[];
  /** La contabile si può spuntare: visura, debito e bilancio ci sono tutti. */
  pronto: boolean;
}

/** Il valore vuoto: quando la lettura non riesce, la scheda dice che manca tutto. */
export const AGGANGIO_VUOTO: AggancioContabile = {
  visura: { presente: false, nomeFile: null, caricataIl: null },
  debito: null,
  anniBilancio: [],
  mancanti: ['visura dell’ente', 'debito dell’ente', 'bilancio XBRL'],
  pronto: false,
};

/**
 * Il debito dell'ente nella forma che serve alla contabile, con la stessa
 * scala di ripiego del Ponte: base certa (contabilizzato + da contabilizzare),
 * poi le posizioni del triage, poi le segnalate alle unità operative. Mai zero
 * davanti a un debito accertato.
 */
export function debitoContabile(
  certificazione: SnapshotDebitoEnte | null,
  triage: DebitoEntePonte | null
): DebitoContabile | null {
  if (certificazione && certificazione.totale > 0) {
    return {
      contabilizzato: certificazione.contabilizzato,
      daContabilizzare: certificazione.daContabilizzare,
      segnalato: certificazione.segnalato,
      totale: certificazione.totale,
      righe: certificazione.righe,
      fonte: certificazione.fonte,
      ripartito: true,
    };
  }
  if (triage) {
    return {
      contabilizzato: 0,
      daContabilizzare: 0,
      segnalato: 0,
      totale: triage.totale,
      righe: triage.righe,
      fonte: triage.fonte,
      ripartito: false,
    };
  }
  if (certificazione && certificazione.segnalato > 0) {
    return {
      contabilizzato: 0,
      daContabilizzare: 0,
      segnalato: certificazione.segnalato,
      totale: certificazione.segnalato,
      righe: certificazione.righeSegnalate,
      fonte:
        'Posizioni segnalate alle unità operative: importo non ancora contabilizzato — stima, non debito iscritto.',
      ripartito: false,
    };
  }
  return null;
}

/**
 * L'aggancio completo. La contabile è pronta solo se ci sono tutti e tre i
 * pezzi: la visura (che è la stessa dell'amministrativa), il debito dell'ente
 * e almeno un bilancio XBRL. I mancanti si elencano in ordine di dipendenza:
 * prima i dati dell'amministrativa, poi il bilancio.
 */
export function aggancioContabile(input: {
  visura: VisuraContabile;
  certificazione: SnapshotDebitoEnte | null;
  triage: DebitoEntePonte | null;
  anniBilancio: number[];
}): AggancioContabile {
  const debito = debitoContabile(input.certificazione, input.triage);
  const anniBilancio = [...new Set(input.anniBilancio)].sort((a, b) => b - a);
  const mancanti: string[] = [];
  if (!input.visura.presente) mancanti.push('visura dell’ente');
  if (!debito) mancanti.push('debito dell’ente (contabilizzato e da contabilizzare)');
  if (anniBilancio.length === 0) mancanti.push('bilancio XBRL');
  return {
    visura: input.visura,
    debito,
    anniBilancio,
    mancanti,
    pronto: mancanti.length === 0,
  };
}
