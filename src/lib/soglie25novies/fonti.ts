// src/lib/soglie25novies/fonti.ts
//
// Da dove viene ciascun importo che entra nel calcolo delle soglie
// dell'art. 25-novies. L'ordine di precedenza è unico e sta qui:
//   1. le posizioni del triage (i numeri dei prospetti caricati);
//   2. il valore scritto nella scheda Soglie;
//   3. solo per i contributi scaduti, il totale del V.E.R.A. caricato
//      (partite contabilizzate e da contabilizzare).
// La scheda Soglie mostra il valore usato e la sua fonte: prima un campo
// vuoto sembrava «dato mancante» mentre il calcolo usava il V.E.R.A., e un
// valore scritto a mano veniva scavalcato dal triage senza dirlo.

export type FonteValore = 'triage' | 'manuale' | 'vera';

export interface ValoreUsato {
  valore: number;
  fonte: FonteValore;
}

export function scegliValore(
  daPosizioni: number | null | undefined,
  manuale: number | null | undefined,
  ripiegoVera: number | null = null
): ValoreUsato | null {
  if (daPosizioni !== null && daPosizioni !== undefined)
    return { valore: daPosizioni, fonte: 'triage' };
  if (manuale !== null && manuale !== undefined) return { valore: manuale, fonte: 'manuale' };
  if (ripiegoVera !== null && ripiegoVera > 0) return { valore: ripiegoVera, fonte: 'vera' };
  return null;
}

/** Campi della scheda Soglie che possono ricevere un valore da un'altra fonte. */
export type CampoConFonte =
  | 'contributiScaduti'
  | 'contributiDovutiAnnoPrecedente'
  | 'premiInail'
  | 'ivaScaduta'
  | 'volumeAffari';

export type ValoriUsati = Partial<Record<CampoConFonte, ValoreUsato>>;
