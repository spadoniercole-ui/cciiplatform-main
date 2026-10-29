// src/lib/triage/veraObbligatorio.ts
//
// IL V.E.R.A. È IL PRESUPPOSTO DEL TRIAGE SOLO DOVE ESISTE PER CHI LO FA.
//
// La posizione debitoria dell'ente è la ragione per cui il triage esiste: per
// l'INPS il file V.E.R.A. è l'unico documento che elenca le posizioni da
// lavorare, e senza di esso la visita resta senza un elenco da instradare.
// Per un ente che quel prospetto non lo emette — o per un professionista, che
// il file lo chiede all'istituto — la stessa regola diventa un blocco senza
// rimedio: il triage non parte e non c'è modo di farlo partire.
//
// Qui la regola, in un punto solo: l'obbligo segue l'ENTE dello spazio (INPS
// obbligatorio, gli altri facoltativo) e l'Admin può imporlo o spegnerlo con
// un'impostazione dello spazio. La risoluzione è PURA — nessun accesso al
// database — così la si può leggere e provare senza un tenant: la lettura
// della tabella sta in obbligoVeraSpazio.ts.

export type OrigineObbligoVera = 'IMPOSTAZIONE' | 'ENTE' | 'PREDEFINITO';

export interface ObbligoVera {
  obbligatorio: boolean;
  /** Da dove viene la decisione: l'impostazione, l'ente, o il ripiego. */
  origine: OrigineObbligoVera;
  /** L'ente riconosciuto per lo spazio, se le sue soglie ne dichiarano uno solo. */
  ente: string | null;
  /** Ciò che l'Admin ha salvato: null = automatico, segue l'ente. */
  impostazione: boolean | null;
}

/** L'unico ente per cui il V.E.R.A. è la fonte delle posizioni da lavorare. */
export const ENTE_CON_VERA_OBBLIGATORIO = 'INPS';

/** Etichette leggibili degli enti ammessi dalle soglie dell'art. 25-novies. */
const ETICHETTA_ENTE: Record<string, string> = {
  INPS: 'INPS',
  INAIL: 'INAIL',
  AGENZIA_ENTRATE: 'Agenzia delle Entrate',
  AGENZIA_RISCOSSIONE: 'Agente della Riscossione',
  NON_PUBBLICO: 'creditore non pubblico',
};

export function etichettaEnte(ente: string | null | undefined): string | null {
  if (!ente) return null;
  return ETICHETTA_ENTE[ente] ?? ente;
}

export function enteRichiedeVera(ente: string | null | undefined): boolean {
  return (
    String(ente ?? '')
      .trim()
      .toUpperCase() === ENTE_CON_VERA_OBBLIGATORIO
  );
}

/**
 * Un solo ente fra le soglie configurate = è l'ente dello spazio. Più d'uno
 * (o nessuno) è una configurazione ambigua: non si sceglie per conto proprio,
 * come già fa la valutazione delle soglie dell'art. 25-novies.
 */
export function enteUnicoDaRighe(righe: { ente_25novies: string | null }[]): string | null {
  const distinti = Array.from(
    new Set(righe.map((r) => r.ente_25novies).filter((e): e is string => !!e))
  );
  return distinti.length === 1 ? distinti[0] : null;
}

export function risolviObbligoVera(impostazione: boolean | null, ente: string | null): ObbligoVera {
  if (impostazione !== null) {
    return { obbligatorio: impostazione, origine: 'IMPOSTAZIONE', ente, impostazione };
  }
  return {
    // Nessun ente riconosciuto: si parte con il V.E.R.A. FACOLTATIVO. Il
    // contrario — obbligatorio per tutti finché qualcuno non lo spegne —
    // rimetterebbe il blocco a ogni spazio nuovo, che è il problema da
    // risolvere. La scheda lo dichiara e l'Admin lo accende in un clic.
    obbligatorio: ente === null ? false : enteRichiedeVera(ente),
    origine: ente === null ? 'PREDEFINITO' : 'ENTE',
    ente,
    impostazione: null,
  };
}

/** La frase da mostrare: dice lo stato E da dove viene, senza far indovinare. */
export function descriviObbligoVera(o: ObbligoVera): string {
  if (o.origine === 'IMPOSTAZIONE') {
    return o.obbligatorio
      ? 'Obbligatorio: scelta di questo spazio, che prevale sull’ente.'
      : 'Facoltativo: scelta di questo spazio, che prevale sull’ente.';
  }
  if (o.origine === 'ENTE') {
    return o.obbligatorio
      ? 'Obbligatorio: lo spazio è dell’INPS, dove il V.E.R.A. è la fonte delle posizioni da lavorare.'
      : `Facoltativo: lo spazio è di ${etichettaEnte(o.ente) ?? 'un altro ente'}, che non emette il V.E.R.A.`;
  }
  return 'Facoltativo: le soglie non dichiarano un solo ente, quindi l’ente dello spazio non si deduce. Se è l’INPS, accendi l’obbligo qui sopra.';
}
