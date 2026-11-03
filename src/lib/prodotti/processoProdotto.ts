// src/lib/prodotti/processoProdotto.ts
//
// IL PROCESSO OPERATIVO — il quarto blocco dei Parametri (0.161.0).
//
// Dato il prodotto, la TS e la direttrice arrivano da sole: il prodotto le
// porta con sé, e l'operatore scrive soltanto che cosa fa l'ufficio per
// gestirlo. Prima qui si parlava di «materia»: era il nome con cui la stessa
// cosa si chiamava in un altro punto della catena, e chi configurava doveva
// tenere a mente due vocabolari per lo stesso lavoro. Il nome «materia» esce
// dalle schermate; la tabella resta, perché i report e i documenti già emessi
// la leggono.
//
// UN PROCESSO, PIÙ ATTIVITÀ. Lo stesso prodotto si gestisce con più passi
// (verifica del flusso, acquisizione della proposta, contabilizzazione): una
// riga per TS, in ordine di esecuzione. La prima è quella che il documento
// dell'ufficio cita come procedura.
//
// Logica pura: nessun accesso al database.

import { unaRiga } from '@/lib/titoliEnte/catalogoTl';
import { MASSIMO_CARATTERI_ATTIVITA_RECUPERO } from '@/lib/titoliEnte/recupero';

export const MASSIMO_CARATTERI_ESITO_PRODOTTO = 200;

/** Una riga del processo operativo: un prodotto, una TS, le attività. */
export interface ProcessoProdotto {
  id: number;
  prodottoId: number;
  tlId: number;
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
  prodottoId: number;
  tlId: number;
  dipendenza: string | null;
  attivita: string | null;
  esito: string | null;
}

export function normalizzaProcesso(input: InputProcessoProdotto): InputProcessoProdotto {
  const riga = (v: string | null | undefined): string | null => {
    const pulito = unaRiga(v ?? '');
    return pulito === '' ? null : pulito;
  };
  return {
    id: input.id ?? null,
    prodottoId: input.prodottoId,
    tlId: input.tlId,
    dipendenza: riga(input.dipendenza),
    attivita: riga(input.attivita),
    esito: riga(input.esito),
  };
}

export function validaProcesso(input: InputProcessoProdotto): string | null {
  if (!Number.isInteger(input.prodottoId) || input.prodottoId <= 0)
    return 'Scegli il prodotto del processo.';
  if (!Number.isInteger(input.tlId) || input.tlId <= 0)
    return 'Scegli la TS che il processo applica al prodotto.';
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
