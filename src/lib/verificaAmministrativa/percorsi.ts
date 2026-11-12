// I TRE PERCORSI, DISTINTI (0.209.0).
//
// La verifica amministrativa non chiude una pratica: apre delle strade, e le
// strade non sono equivalenti. Questo modulo le descrive una per una, con chi
// decide che cosa, perché mettere «accordo» e «cram down» sullo stesso piano
// produce un documento tecnicamente sbagliato: il primo si definisce col voto
// dei creditori, il secondo con il provvedimento del giudice.
//
// Il modulo non sceglie: riceve il percorso consigliato e mette quello per
// primo. La scelta resta all'ente, come sempre.
//
// Logica pura, con i suoi test.

import {
  ESITI_PROPOSTA,
  MESSAGGIO_NON_EQUIPARABILI,
  type VoceEsitoProposta,
} from '@/lib/scenari/esitoProposta';

export type CodicePercorso = 'ACCORDO_TRANSATTIVO' | 'LIQUIDAZIONE_GIUDIZIALE' | 'CRAM_DOWN';

export interface PercorsoDescritto {
  codice: CodicePercorso;
  etichetta: string;
  /** Chi decide l'esito del percorso. */
  chiDecide: string;
  /** Che cosa è, in una riga. */
  natura: string;
  /** Che cosa serve perché il percorso stia in piedi. */
  presupposti: string[];
  /** Gli esiti possibili: solo l'accordo ne ha tre, perché solo l'accordo si vota. */
  esiti?: VoceEsitoProposta[];
  limiti: string[];
}

export const PERCORSI: PercorsoDescritto[] = [
  {
    codice: 'ACCORDO_TRANSATTIVO',
    etichetta: 'Accordo transattivo',
    chiDecide: 'i creditori, con il voto sulla proposta; il tribunale sull’omologazione',
    natura:
      'Un piano proposto dall’azienda e sottoposto al voto dei creditori, con percentuali e tempi per ciascuna classe.',
    presupposti: [
      'Una proposta formulata dall’azienda, con le quote e i tempi per ogni classe di credito.',
      'Il consenso dei creditori nella misura prevista, e l’omologazione.',
      'Il confronto con la liquidazione, perché la proposta si misura su quello che il creditore otterrebbe altrimenti.',
    ],
    esiti: ESITI_PROPOSTA,
    limiti: [
      'Il consenso non è acquisito in partenza: la proposta può non essere votata, o essere votata e non omologata.',
    ],
  },
  {
    codice: 'LIQUIDAZIONE_GIUDIZIALE',
    etichetta: 'Liquidazione giudiziale',
    chiDecide: 'il tribunale, con l’apertura della procedura',
    natura:
      'La via giudiziale di realizzo dell’attivo: non è un piano, è l’apertura della procedura.',
    presupposti: [
      'La valutazione comparativa con le altre strade, sui valori di realizzo configurati nello spazio.',
      'La stima di realizzo dichiarata e confrontabile con il soddisfacimento offerto dalla proposta.',
    ],
    limiti: [
      'Il confronto si fa sui numeri, non sulle intenzioni: senza stima di realizzo la comparazione non regge.',
    ],
  },
  {
    codice: 'CRAM_DOWN',
    etichetta: 'Cram down',
    chiDecide: 'il giudice, con il proprio provvedimento: i creditori non votano l’adesione',
    natura:
      'Un piano reso efficace dal provvedimento del giudice anche in presenza del dissenso dei creditori.',
    presupposti: [
      'Un piano che superi la verifica del giudice, con il soddisfacimento dei creditori dissenzienti.',
      'La dimostrazione che il trattamento offerto non è deteriore rispetto all’alternativa.',
    ],
    limiti: [
      'Non è un accordo con un altro nome: qui non c’è il voto che definisce l’intesa, c’è un provvedimento che la rende efficace.',
    ],
  },
];

export const NON_EQUIPARABILI = MESSAGGIO_NON_EQUIPARABILI;

/**
 * I percorsi nell'ordine in cui vanno letti: prima quello da valutare, poi gli
 * altri due nella sequenza accordo → liquidazione → cram down.
 */
export function percorsiOrdinati(consigliato: CodicePercorso | null): PercorsoDescritto[] {
  if (!consigliato) return [...PERCORSI];
  const primo = PERCORSI.find((p) => p.codice === consigliato);
  return primo ? [primo, ...PERCORSI.filter((p) => p.codice !== consigliato)] : [...PERCORSI];
}
