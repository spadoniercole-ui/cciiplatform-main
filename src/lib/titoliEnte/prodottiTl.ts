// src/lib/titoliEnte/prodottiTl.ts
//
// LE TL STANNO NEI PRODOTTI (0.157.0).
//
// Prima la TL — la tipologia di lavorazione: «emissione della diffida»,
// «verifica del flusso» — nasceva dentro la materia. Il prodotto era solo un
// nome nel questionario, e per lavorarlo bisognava aspettare che una materia
// esistesse, inventare lì la TL e poi associarla ai codici: il flusso 1 → 2 → 3
// (direttrici e prodotti, lavorazioni, titoli) girava al contrario.
//
// Qui il catalogo ha la forma che il lavoro ha davvero: una direttrice (l'ufficio),
// i suoi prodotti (i fatti concreti: DURC, Cassa Integrazione, verbale) e, per
// ogni prodotto, le TL con cui l'ente le lavora — ufficio, passi, esito e
// contrassegno di perimetro. La materia non possiede più la TL: la eredita,
// associandola ai propri codici. I titoli di credito restano il punto in cui il
// codice dichiara la sua materia e, se vuole, un ufficio proprio.
//
// Logica pura: tipi, validazione, normalizzazione, raggruppamento. Nessun
// accesso al database, così si verifica con i test.

import {
  MASSIMO_CARATTERI_ESITO,
  MASSIMO_CARATTERI_TIPOLOGIA,
  normalizzaEsito,
  normalizzaTipologia,
} from './lavorazioniMateria';
import {
  normalizzaAttivitaRecupero,
  normalizzaDipendenza,
  validaAttivitaRecupero,
  validaDipendenza,
} from './recupero';

/** Il verso della TL nella check di perimetro del triage. */
export type VersoPerimetroTl = 'COLLABORATIVA' | 'RESISTENZA';

/** Una TL del catalogo: appartiene a un prodotto di una direttrice. */
export interface TlProdotto {
  id: number;
  /** L'ufficio che la esegue: è anche il nome della direttrice. */
  direttrice: string;
  /** Il fatto concreto a cui la TL si applica (il «prodotto»). */
  prodotto: string;
  tipologia: string;
  dipendenza: string | null;
  procedura: string | null;
  esito: string | null;
  ordine: number;
  rilevantePerimetro: boolean;
  versoPerimetro: VersoPerimetroTl | null;
  /** Quante materie la ereditano: 0 = nessun codice la sta lavorando. */
  materie: number;
}

export interface InputTlProdotto {
  id?: number | null;
  direttrice: string;
  prodotto: string;
  tipologia: string;
  dipendenza: string | null;
  procedura: string | null;
  esito: string | null;
  rilevantePerimetro?: boolean;
  versoPerimetro?: VersoPerimetroTl | null;
}

/** Testo su una riga sola, senza bordi: il nome di un prodotto non è un tema. */
export function unaRiga(testo: string | null | undefined): string {
  return (testo ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * ERRORE DA MOSTRARE, oppure null.
 *
 * Direttrice e prodotto sono obbligatori perché sono la chiave: una TL senza
 * prodotto non si sa dove sta, e tornerebbe a essere la TL «della materia» che
 * questa riorganizzazione toglie di mezzo. Il verso è obbligatorio col
 * contrassegno di perimetro, come già per la lavorazione.
 */
export function validaTlProdotto(input: InputTlProdotto): string | null {
  if (!unaRiga(input.direttrice)) return 'Scegli la direttrice della TL.';
  if (!unaRiga(input.prodotto)) return 'Indica il prodotto a cui la TL appartiene.';
  const tipologia = normalizzaTipologia(input.tipologia);
  if (!tipologia) return 'Indica la TL: è il nome che la distingue nel prodotto.';
  if (tipologia.length > MASSIMO_CARATTERI_TIPOLOGIA)
    return `La TL non può superare ${MASSIMO_CARATTERI_TIPOLOGIA} caratteri.`;
  const esito = normalizzaEsito(input.esito);
  if (esito && esito.length > MASSIMO_CARATTERI_ESITO)
    return `L'esito non può superare ${MASSIMO_CARATTERI_ESITO} caratteri.`;
  if (input.rilevantePerimetro === true && !input.versoPerimetro)
    return 'Se la TL è rilevante per il perimetro, indica se è collaborativa o di resistenza.';
  return validaDipendenza(input.dipendenza) ?? validaAttivitaRecupero(input.procedura);
}

export function normalizzaTlProdotto(input: InputTlProdotto): InputTlProdotto {
  return {
    id: input.id ?? null,
    direttrice: unaRiga(input.direttrice),
    prodotto: unaRiga(input.prodotto),
    tipologia: normalizzaTipologia(input.tipologia),
    dipendenza: normalizzaDipendenza(input.dipendenza),
    procedura: normalizzaAttivitaRecupero(input.procedura),
    esito: normalizzaEsito(input.esito),
    rilevantePerimetro: input.rilevantePerimetro === true,
    versoPerimetro:
      input.rilevantePerimetro === true && input.versoPerimetro ? input.versoPerimetro : null,
  };
}

/** La chiave del prodotto: direttrice e prodotto, senza dipendere dalla grafia. */
export function chiaveProdotto(direttrice: string, prodotto: string): string {
  return `${unaRiga(direttrice).toLowerCase()}|${unaRiga(prodotto).toLowerCase()}`;
}

export interface GruppoProdotto {
  direttrice: string;
  prodotto: string;
  voci: TlProdotto[];
}

/**
 * Il catalogo come si legge: per prodotto, nell'ordine scritto, con le TL in
 * ordine di esecuzione. Le direttrici vuote finiscono in fondo: sono righe da
 * sistemare, non un ufficio.
 */
export function raggruppaPerProdotto(tl: TlProdotto[]): GruppoProdotto[] {
  const gruppi = new Map<string, GruppoProdotto>();
  for (const voce of tl) {
    const chiave = chiaveProdotto(voce.direttrice, voce.prodotto);
    const gruppo = gruppi.get(chiave) ?? {
      direttrice: voce.direttrice,
      prodotto: voce.prodotto,
      voci: [],
    };
    gruppo.voci.push(voce);
    gruppi.set(chiave, gruppo);
  }
  return Array.from(gruppi.values())
    .map((g) => ({
      ...g,
      voci: g.voci.slice().sort((a, b) => a.ordine - b.ordine || a.id - b.id),
    }))
    .sort(
      (a, b) =>
        a.direttrice.localeCompare(b.direttrice, 'it') || a.prodotto.localeCompare(b.prodotto, 'it')
    );
}

/** Una riga del database nella forma del catalogo. */
export function rigaTlProdotto(r: Record<string, unknown>): TlProdotto {
  return {
    id: Number(r.id),
    direttrice: String(r.direttrice ?? ''),
    prodotto: String(r.prodotto ?? ''),
    tipologia: String(r.tipologia ?? ''),
    dipendenza: (r.dipendenza as string | null) ?? null,
    procedura: (r.procedura as string | null) ?? null,
    esito: (r.esito as string | null) ?? null,
    ordine: Number(r.ordine ?? 0),
    rilevantePerimetro: r.rilevante_perimetro === true,
    versoPerimetro:
      r.verso_perimetro === 'COLLABORATIVA' || r.verso_perimetro === 'RESISTENZA'
        ? r.verso_perimetro
        : null,
    materie: Number(r.materie ?? 0),
  };
}
