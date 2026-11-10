// IL DEBITO CHE LA VERIFICA AMMINISTRATIVA CONSEGNA ALLA CONTABILE.
//
// La verifica amministrativa si chiude con un dato che non è un'opinione: il
// debito che l'ente ha verso l'azienda, letto dai propri archivi (la
// certificazione dei debiti, o le posizioni del triage quando la prima non è
// arrivata). Finora quel numero esisteva solo come calcolo a schermo: la
// contabile lo rileggeva per conto suo, e due letture dello stesso archivio
// potevano divergere.
//
// Qui il dato prende una forma sola, quella che si memorizza: la stessa scala
// di ripiego del Ponte, con i tre stati dichiarati separatamente. Il debito
// certo resta contabilizzato + da contabilizzare; le posizioni segnalate alle
// unità operative si conservano e restano fuori dal totale. Quando il dato non
// distingue gli stati — posizioni del triage o segnalate — lo dice `ripartito:
// false`, invece di mostrare zeri che sembrano misure.
//
// Logica pura: non legge il database e non scrive. La lettura e il salvataggio
// stanno in `memorizzaDebitoEnte.ts`, la regola qui.

import { debitoEnteConRipiego, type SnapshotDebitoEnte } from '@/lib/ponte/debitoEnte';
import type { DebitoEntePonte } from '@/lib/ponte/types';

/** Da dove arriva la cifra memorizzata. */
export type FonteDebitoMemorizzato = 'certificazione' | 'triage' | 'segnalato';

export interface DebitoMemorizzato {
  /** Contabilizzato + da contabilizzare: il debito certo, o la stima dichiarata. */
  totale: number;
  contabilizzato: number;
  daContabilizzare: number;
  /** Posizioni segnalate alle unità operative, fuori dal totale. */
  segnalato: number;
  contributi: number;
  sanzioni: number;
  creditiAgente: number;
  righe: number;
  righeSegnalate: number;
  /** true solo quando gli stati contabilizzato/da contabilizzare sono distinti. */
  ripartito: boolean;
  /** true quando lo zero di `sanzioni` è un'assenza dichiarata, non una misura. */
  sanzioniNonDistinte: boolean;
  fonte: string;
  fonteTipo: FonteDebitoMemorizzato;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Il debito nella forma da memorizzare, oppure null quando non c'è nulla da
 * memorizzare: nessuna certificazione, nessuna posizione del triage, nessuna
 * segnalata con importo. Uno zero non si memorizza come se fosse un dato.
 */
export function debitoDaMemorizzare(
  certificazione: SnapshotDebitoEnte | null,
  triage: DebitoEntePonte | null
): DebitoMemorizzato | null {
  const debito = debitoEnteConRipiego(certificazione, triage);
  if (!debito || !(debito.totale > 0)) return null;

  const fonteTipo: FonteDebitoMemorizzato =
    certificazione && certificazione.totale > 0
      ? 'certificazione'
      : triage
        ? 'triage'
        : 'segnalato';

  // Solo la certificazione porta i tre stati; il ripiego del triage e le
  // posizioni segnalate hanno una cifra sola, e non si scompone.
  const dettaglio = fonteTipo === 'certificazione' ? (debito as SnapshotDebitoEnte) : null;

  return {
    totale: arrotonda(debito.totale),
    contabilizzato: arrotonda(numero(dettaglio?.contabilizzato)),
    daContabilizzare: arrotonda(numero(dettaglio?.daContabilizzare)),
    segnalato: arrotonda(numero(dettaglio?.segnalato ?? debito.segnalato)),
    contributi: arrotonda(numero(debito.contributi)),
    sanzioni: arrotonda(numero(debito.sanzioni)),
    creditiAgente: arrotonda(numero(debito.creditiAgente)),
    righe: numero(debito.righe),
    righeSegnalate: numero(dettaglio?.righeSegnalate ?? debito.righeSegnalate),
    ripartito: Boolean(dettaglio),
    sanzioniNonDistinte: Boolean((debito as DebitoEntePonte).sanzioniNonDistinte),
    fonte: debito.fonte,
    fonteTipo,
  };
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

/**
 * La riga che l'operatore legge a verifica chiusa: che cosa è stato
 * memorizzato, da dove viene e quando — senza la quale il numero sembrerebbe
 * caduto dal cielo.
 */
export function descrizioneMemorizzazione(
  debito: DebitoMemorizzato,
  memorizzatoIl: string | null
): string {
  const quando = memorizzatoIl ? ` il ${memorizzatoIl}` : '';
  if (debito.fonteTipo === 'certificazione') {
    return (
      `Debito dell’ente memorizzato${quando}: ${euro(debito.totale)} — ` +
      `contabilizzato ${euro(debito.contabilizzato)}, da contabilizzare ${euro(debito.daContabilizzare)}` +
      (debito.segnalato > 0 ? `, ${euro(debito.segnalato)} segnalati alle unità operative` : '') +
      '.'
    );
  }
  if (debito.fonteTipo === 'triage') {
    return (
      `Debito dell’ente memorizzato${quando}: ${euro(debito.totale)} dalle posizioni del triage. ` +
      'Il triage non distingue contabilizzato e da contabilizzare: il totale è dichiarato, la ripartizione no.'
    );
  }
  return (
    `Debito dell’ente memorizzato${quando}: ${euro(debito.totale)} dalle posizioni segnalate alle unità operative. ` +
    'È una stima dichiarata, non un debito iscritto.'
  );
}
