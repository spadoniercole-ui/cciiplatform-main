// src/lib/prodotti/processoProdotto.ts
//
// L'OPERATIVITÀ DEL PRODOTTO — il quarto blocco dei Parametri (0.162.0).
//
// IL PROCESSO NON È «UNA RIGA PER TS». È un'operatività: quello che l'ufficio
// fa, con le TS che servono a farlo. Da qui tre conseguenze, che sono la
// ragione del cambio:
//
//  - LA STESSA TS PUÒ SERVIRE A PIÙ OPERATIVITÀ. La TS 81 descrive la diffida,
//    ma una diffida può essere il passo della sollecitazione e il passo della
//    costituzione in mora: sono due processi, la stessa lavorazione.
//  - UN'OPERATIVITÀ PUÒ METTERE INSIEME PIÙ TS. Le M400 guardano il momento
//    del licenziamento, gli sgravi la vita lavorativa: verificano cose diverse
//    e servono entrambe a definire il processo. Non si escludono.
//  - SI SCRIVE CIÒ CHE SI È IDENTIFICATO. Non c'è uno schema da riempire: il
//    prodotto si sceglie dalla sua scheda, le TS si spuntano dove servono e le
//    attività si scrivono come le esegue l'ufficio.
//
// I GRUPPI SONO IL LEGAME. Le righe della tabella restano una per TS — i report
// le leggono così — e `gruppo` tiene insieme quelle salvate nella stessa
// operatività: modificare le attività di una non lascia indietro le altre.
// Le righe scritte prima dei gruppi non ne hanno: ognuna è un'operatività di
// sé, e resta valida.
//
// LA TS NON APPARTIENE A UN PRODOTTO SOLO. L'associazione sul catalogo resta
// quella in cui la TS è nata; un processo può applicarla anche altrove, perché
// è il processo a dichiarare «su questo prodotto questa TS si esegue così».
//
// Logica pura: nessun accesso al database.

import { unaRiga } from '@/lib/titoliEnte/catalogoTl';
import { MASSIMO_CARATTERI_ATTIVITA_RECUPERO } from '@/lib/titoliEnte/recupero';

export const MASSIMO_CARATTERI_ESITO_PRODOTTO = 200;

/** Quante TS può mettere insieme una sola operatività. */
export const MASSIMO_TS_OPERATIVITA = 40;

/** Una riga del processo operativo: un prodotto, una TS, le attività. */
export interface ProcessoProdotto {
  id: number;
  prodottoId: number;
  tlId: number;
  /**
   * Il gruppo dell'operatività: tiene insieme le TS salvate con le stesse
   * attività. null per le righe scritte prima dei gruppi (0.161.0), che
   * restano leggibili e modificabili singolarmente.
   */
  gruppo: string | null;
  /** Il codice della TS e la sua descrizione, per leggere la riga. */
  codice: string;
  tipologia: string;
  /** L'ufficio che esegue le attività. */
  dipendenza: string | null;
  /** Le attività, un passo per riga. */
  attivita: string | null;
  /** Che cosa produce il processo: «diffida notificata». */
  esito: string | null;
  ordine: number;
}

export interface InputProcessoProdotto {
  id?: number | null;
  /** Il gruppo da modificare; null/assente = nuova operatività. */
  gruppo?: string | null;
  prodottoId: number;
  /** Le TS dell'operatività: una o più, anche già usate in un'altra. */
  tlIds: number[];
  dipendenza: string | null;
  attivita: string | null;
  esito: string | null;
}

export function normalizzaProcesso(input: InputProcessoProdotto): InputProcessoProdotto {
  const riga = (v: string | null | undefined): string | null => {
    const pulito = unaRiga(v ?? '');
    return pulito === '' ? null : pulito;
  };
  // Una TS ripetuta sarebbe la stessa riga due volte: la seconda
  // sovrascriverebbe la prima e l'operatività conterebbe una TS che non ha.
  const viste = new Set<number>();
  const tlIds = (input.tlIds ?? [])
    .map((x) => Number(x))
    .filter((x) => {
      if (!Number.isInteger(x) || x <= 0 || viste.has(x)) return false;
      viste.add(x);
      return true;
    });
  return {
    id: input.id ?? null,
    gruppo: riga(input.gruppo),
    prodottoId: input.prodottoId,
    tlIds,
    dipendenza: riga(input.dipendenza),
    attivita: riga(input.attivita),
    esito: riga(input.esito),
  };
}

export function validaProcesso(input: InputProcessoProdotto): string | null {
  if (!Number.isInteger(input.prodottoId) || input.prodottoId <= 0)
    return 'Scegli il prodotto del processo.';
  const ts = input.tlIds ?? [];
  if (ts.some((x) => !Number.isInteger(Number(x)) || Number(x) <= 0))
    return 'Una delle TS scelte non è valida.';
  if (ts.length === 0)
    return 'Spunta almeno una TS: il processo dice quali lavorazioni eseguono il prodotto.';
  if (ts.length > MASSIMO_TS_OPERATIVITA)
    return `Un’operatività non può mettere insieme più di ${MASSIMO_TS_OPERATIVITA} TS.`;
  const attivita = unaRiga(input.attivita ?? '');
  if (!attivita)
    return 'Descrivi le attività: è il processo che l’ufficio esegue su questo prodotto.';
  if (attivita.length > MASSIMO_CARATTERI_ATTIVITA_RECUPERO)
    return `Le attività non possono superare ${MASSIMO_CARATTERI_ATTIVITA_RECUPERO} caratteri.`;
  const esito = unaRiga(input.esito ?? '');
  if (esito.length > MASSIMO_CARATTERI_ESITO_PRODOTTO)
    return `L’esito non può superare ${MASSIMO_CARATTERI_ESITO_PRODOTTO} caratteri.`;
  return null;
}

/** Una riga del database nella forma del modello. */
export function rigaProcesso(r: Record<string, unknown>): ProcessoProdotto {
  return {
    id: Number(r.id),
    prodottoId: Number(r.prodotto_id),
    tlId: Number(r.tl_id),
    gruppo: (r.gruppo as string | null) ?? null,
    codice: String(r.codice ?? ''),
    tipologia: String(r.descrizione ?? ''),
    dipendenza: (r.dipendenza as string | null) ?? null,
    attivita: (r.procedura as string | null) ?? null,
    esito: (r.esito as string | null) ?? null,
    ordine: Number(r.ordine ?? 0),
  };
}

/** I processi di un prodotto, nell'ordine in cui l'ufficio li esegue. */
export function processiDelProdotto(
  processi: ProcessoProdotto[],
  prodottoId: number
): ProcessoProdotto[] {
  return processi
    .filter((p) => p.prodottoId === prodottoId)
    .sort((a, b) => a.ordine - b.ordine || a.id - b.id);
}

/** Un'operatività letta dalle sue righe: le TS, le attività, l'esito. */
export interface OperativitaProdotto {
  /**
   * La chiave da passare al salvataggio: l'id del gruppo, oppure `r<id>`
   * per le righe scritte prima dei gruppi (una riga = un'operatività).
   */
  chiave: string;
  gruppo: string | null;
  tlIds: number[];
  codici: string[];
  dipendenza: string | null;
  attivita: string | null;
  esito: string | null;
  ordine: number;
}

/**
 * Le operatività di un prodotto, nell'ordine di esecuzione.
 *
 * Le righe senza gruppo sono una operatività ciascuna: è così che si leggono
 * e si modificano i processi scritti con la versione precedente, senza
 * riscriverli.
 */
export function operativitaDelProdotto(
  processi: ProcessoProdotto[],
  prodottoId: number
): OperativitaProdotto[] {
  const gruppi = new Map<string, ProcessoProdotto[]>();
  for (const p of processiDelProdotto(processi, prodottoId)) {
    const chiave = p.gruppo || `r${p.id}`;
    gruppi.set(chiave, [...(gruppi.get(chiave) ?? []), p]);
  }
  return Array.from(gruppi.entries())
    .map(([chiave, righe]) => {
      const prima = righe[0];
      return {
        chiave,
        gruppo: prima?.gruppo ?? null,
        tlIds: righe.map((r) => r.tlId),
        codici: righe.map((r) => r.codice),
        dipendenza: righe.find((r) => r.dipendenza)?.dipendenza ?? null,
        attivita: righe.find((r) => r.attivita)?.attivita ?? null,
        esito: righe.find((r) => r.esito)?.esito ?? null,
        ordine: Math.min(...righe.map((r) => r.ordine)),
      };
    })
    .sort((a, b) => a.ordine - b.ordine || a.chiave.localeCompare(b.chiave));
}
