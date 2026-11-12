// L'ESITO DELLA PROPOSTA (0.209.0).
//
// Una proposta di accordo transattivo non ha un esito solo. Dal voto dei
// creditori possono uscire tre cose diverse, e non sono la stessa cosa:
//
//   1. la DEFINIZIONE DELL'ACCORDO — i creditori votano e l'intesa si chiude;
//   2. la PRESENTAZIONE AL TRIBUNALE — la proposta non si chiude in accordo e
//      la strada che resta è l'apertura della liquidazione giudiziale;
//   3. il CRAM DOWN — il piano viene reso efficace con il provvedimento del
//      giudice, anche senza il consenso dei creditori.
//
// Il terzo non è una variante del primo: il primo è un'intesa votata, il
// terzo un atto del giudice. Per questo gli esiti si registrano sullo scenario
// come IPOTESI DICHIARATA di ciò che si sta valutando, e la piattaforma non
// dice quale accadrà: quello lo diranno i creditori e il giudice.
//
// Logica pura, con i suoi test.

export type EsitoProposta = 'DEFINIZIONE_ACCORDO' | 'APERTURA_LIQUIDAZIONE' | 'CRAM_DOWN';

export interface VoceEsitoProposta {
  codice: EsitoProposta;
  etichetta: string;
  /** Chi produce l'esito: il voto, il tribunale, il giudice. */
  chiDecide: string;
  descrizione: string;
}

export const ESITI_PROPOSTA: VoceEsitoProposta[] = [
  {
    codice: 'DEFINIZIONE_ACCORDO',
    etichetta: 'Definizione dell’accordo',
    chiDecide: 'i creditori, con il voto sulla proposta',
    descrizione:
      'La proposta raccoglie il consenso e l’accordo si definisce: si procede con l’omologazione.',
  },
  {
    codice: 'APERTURA_LIQUIDAZIONE',
    etichetta: 'Presentazione al tribunale: apertura della liquidazione giudiziale',
    chiDecide: 'il tribunale, con l’apertura della procedura',
    descrizione:
      'La proposta non si chiude in accordo: la strada che resta è la presentazione al tribunale, che apre la liquidazione giudiziale.',
  },
  {
    codice: 'CRAM_DOWN',
    etichetta: 'Cram down',
    chiDecide: 'il giudice, con il proprio provvedimento',
    descrizione:
      'Il piano viene imposto ai creditori dissenzienti con il provvedimento del giudice, anche senza il loro consenso: non c’è un voto che definisce l’intesa.',
  },
];

/**
 * Il confine che non va perso: accordo e cram down non sono lo stesso piano
 * con due nomi. Uno si regge sul voto, l'altro sul provvedimento.
 */
export const MESSAGGIO_NON_EQUIPARABILI =
  'Accordo transattivo e cram down non stanno sullo stesso piano: l’accordo è una proposta dell’azienda che si definisce con il voto dei creditori; il cram down è un piano che il giudice rende efficace con il proprio provvedimento, anche senza quel consenso. La liquidazione giudiziale non è un piano: è l’apertura della procedura.';

export function esitoPropostaValido(v: unknown): v is EsitoProposta {
  return v === 'DEFINIZIONE_ACCORDO' || v === 'APERTURA_LIQUIDAZIONE' || v === 'CRAM_DOWN';
}

export function etichettaEsitoProposta(codice: EsitoProposta | null | undefined): string {
  if (!codice) return 'non indicato';
  return ESITI_PROPOSTA.find((e) => e.codice === codice)?.etichetta ?? 'non indicato';
}
