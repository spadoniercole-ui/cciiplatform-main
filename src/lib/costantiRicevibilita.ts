// src/lib/costantiRicevibilita.ts
//
// In un file separato perché i file 'use server' possono esportare solo
// funzioni async: una costante qui dentro fa fallire la build (stesso
// principio già visto con MODULI_PERMESSO e RUOLI_ADMIN_SPAZIO).

/** Categoria sentinella usata quando lo spazio è ENTE — un solo limite, non N per nome creditore: per un ente a scopo singolo (es. INPS) non ha senso una lista di categorie, conta solo la propria soglia. */
export const CATEGORIA_SENTINELLA_ENTE = '__ENTE__';

/** Ordine fisso dei 7 campi di base della Check List custom — peso sempre per ultimo, anche in Excel. */
export const ORDINE_CAMPI_BASE_CHECKLIST = [
  'sezioneNumero',
  'sezioneTitolo',
  'domandaId',
  'domanda',
  'aCuraDi',
  'nota',
  'peso',
] as const;

/** Chiavi campo1..campo10 dell'Anagrafica Ente, nell'ordine. */
export const CHIAVI_CAMPO_ANAGRAFICA_ENTE = Array.from(
  { length: 10 },
  (_, i) => `campo${i + 1}`
) as string[];
