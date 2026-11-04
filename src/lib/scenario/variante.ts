// src/lib/scenario/variante.ts
//
// LE TRE VARIANTI DELLO SCENARIO (0.159.0).
//
// Aprire lo scenario non basta più: prima si dice che cosa si sta esaminando —
// la proposta dell'azienda, un cram down disposto dal tribunale, un decreto di
// liquidazione giudiziale. Le tre cose non si guardano allo stesso modo.
//
//  - PROPOSTA_AZIENDA: è una trattativa, e resta tutto com'è: righe di
//    proposta, requisiti, piano, relazione.
//  - CRAM_DOWN e DECRETO_LIQUIDAZIONE: c'è un provvedimento. Non c'è nulla da
//    negoziare: si legge il documento, si cercano i riferimenti all'ente e si
//    mette a confronto ciò che l'ente detiene con ciò che il tribunale ha
//    accordato o liquidato. Il confronto è differenziale, mai assoluto: senza
//    il credito dell'ente il numero del tribunale non dice nulla.
//
// La variante NON è un legame esclusivo con i campi indice: si può cambiare
// finché lo scenario non è chiuso, e i dati già inseriti non si perdono.
//
// Logica pura, con i suoi test.

export type VarianteScenario = 'PROPOSTA_AZIENDA' | 'CRAM_DOWN' | 'DECRETO_LIQUIDAZIONE';

export interface VoceVariante {
  valore: VarianteScenario;
  etichetta: string;
  descrizione: string;
  /** true = serve il provvedimento caricato e analizzato. */
  richiedeProvvedimento: boolean;
}

export const VARIANTI_SCENARIO: VoceVariante[] = [
  {
    valore: 'PROPOSTA_AZIENDA',
    etichetta: 'Proposta dell’azienda',
    descrizione:
      'C’è una trattativa in corso: si valutano le righe della proposta, i requisiti, il piano. È il percorso di sempre.',
    richiedeProvvedimento: false,
  },
  {
    valore: 'CRAM_DOWN',
    etichetta: 'Cram down disposto dal tribunale',
    descrizione:
      'Il tribunale ha omologato un trattamento contro il dissenso: si legge il provvedimento e lo si confronta con quanto l’ente detiene.',
    richiedeProvvedimento: true,
  },
  {
    valore: 'DECRETO_LIQUIDAZIONE',
    etichetta: 'Decreto di liquidazione giudiziale',
    descrizione:
      'L’azienda è in liquidazione: si legge il decreto, si cercano i riferimenti all’ente e si confronta il liquidato con il credito vantato.',
    richiedeProvvedimento: true,
  },
];

export function varianteValida(valore: unknown): valore is VarianteScenario {
  return typeof valore === 'string' && VARIANTI_SCENARIO.some((v) => v.valore === valore);
}

export function voceVariante(valore: string | null | undefined): VoceVariante | null {
  return VARIANTI_SCENARIO.find((v) => v.valore === valore) ?? null;
}

/** Variante di partenza: la proposta per uno scenario ricevuto, nessuna per gli altri. */
export function varianteIniziale(tipoProposta: string | null | undefined): VarianteScenario | null {
  return tipoProposta === 'RICEVUTA' ? 'PROPOSTA_AZIENDA' : null;
}

export function richiedeProvvedimento(valore: VarianteScenario | null | undefined): boolean {
  return voceVariante(valore)?.richiedeProvvedimento === true;
}

/** Quali dati ha senso mostrare in ciascuna variante. */
export function mostraRigheProposta(valore: VarianteScenario | null | undefined): boolean {
  return valore === null || valore === 'PROPOSTA_AZIENDA';
}
