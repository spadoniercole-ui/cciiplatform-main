// LA DATA DI RIFERIMENTO E L'INVECCHIAMENTO (0.242.0).
//
// La validità a sei mesi copre il triage; le altre verifiche poggiano su dati
// che invecchiano per conto loro: un bilancio depositato dopo la verifica, un
// debito riaccertato, una visura ricaricata. Se un dato a monte è più recente
// dell'esito registrato, la posizione non è «fresca»: è calcolata su un mondo
// che non c'è più, e va detto prima che qualcuno la citi in una delibera.
//
// Nessuna soglia di legge, nessun numero inventato: si confrontano date.
//
// Logica pura, con i suoi test.

export interface DatoDatato {
  fonte: string;
  /** ISO (YYYY-MM-DD va bene: è una data, non un istante). */
  data: string | null;
  cosa: string;
}

export type EsitoInvecchiamento = 'AGGIORNATO' | 'DA_RICALCOLARE' | 'NON_DATABILE';

export interface Invecchiamento {
  dataRiferimento: string | null;
  voci: DatoDatato[];
  /** I dati arrivati DOPO la verifica: le verifiche a valle li ignorano. */
  superati: DatoDatato[];
  esito: EsitoInvecchiamento;
  dettaglio: string;
}

const dataValida = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const giorno = (iso: string | null): string => {
  const d = dataValida(iso);
  if (!d) return 'senza data';
  return d.toLocaleDateString('it-IT');
};

/**
 * @param verifica la verifica amministrativa: l'atto a cui le altre si
 *        appoggiano.
 * @param dati i dati che possono essere arrivati dopo.
 */
export function valutaInvecchiamento(input: {
  verifica: DatoDatato;
  dati: DatoDatato[];
}): Invecchiamento {
  const riferimento = dataValida(input.verifica.data);
  const voci = [input.verifica, ...input.dati];

  if (!riferimento) {
    return {
      dataRiferimento: null,
      voci,
      superati: [],
      esito: 'NON_DATABILE',
      dettaglio:
        'La verifica amministrativa non porta una data: non si può dire se i dati letti sono più recenti del giudizio.',
    };
  }

  const superati = input.dati.filter((d) => {
    const quando = dataValida(d.data);
    return quando !== null && quando.getTime() > riferimento.getTime();
  });

  if (superati.length === 0) {
    return {
      dataRiferimento: input.verifica.data,
      voci,
      superati,
      esito: 'AGGIORNATO',
      dettaglio: `Nessun dato è arrivato dopo la verifica del ${giorno(input.verifica.data)}: la posizione è aggiornata a quella data.`,
    };
  }

  return {
    dataRiferimento: input.verifica.data,
    voci,
    superati,
    esito: 'DA_RICALCOLARE',
    dettaglio: `Dopo la verifica del ${giorno(input.verifica.data)} sono arrivati ${superati
      .map((s) => `${s.cosa} (${giorno(s.data)})`)
      .join(', ')}: la posizione va ricalcolata prima di usarla.`,
  };
}
