// src/lib/portable/risultato.ts
//
// IL RISULTATO DI UNA QUERY NELL'EDIZIONE PORTABLE (0.245.0).
//
// Il codice dell'applicazione è scritto per il driver `pg`: legge `rows`, e per
// capire se una riga esiste legge `rowCount`. PGlite — il Postgres in WASM
// dell'edizione portable e dell'ambiente demo — restituisce un oggetto con
// `rows`, `fields` e `affectedRows`, e per un `SELECT` che trova una riga
// riporta `affectedRows: 0`, perché nessuna riga è stata *modificata*.
//
// Prendere quel numero come conteggio delle righe lette rendeva «nessuna riga»
// un risultato che una riga ce l'ha. L'effetto osservabile: la check list dei
// prodotti mostrava le domande e al primo salvataggio rispondeva «Prodotto non
// trovato.» — con il prodotto nella tabella, davanti agli occhi di chi
// rispondeva. Lo stesso valeva per ogni azione che controlla `rowCount === 0`
// dopo un `SELECT`: la riga c'era e il sistema diceva di no.
//
// Qui la regola è una sola: se sono state lette righe, il conteggio è quante
// sono; solo quando non ce ne sono si guarda `affectedRows` (una scrittura
// senza `RETURNING` non restituisce righe, ma dice quante ne ha toccate).

/** La forma che il resto dell'applicazione si aspetta da una query. */
export interface RisultatoQuery {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: unknown[];
}

/** Il risultato grezzo di PGlite, nella forma del driver `pg`. */
export function normalizzaRisultato(r: unknown): RisultatoQuery {
  const grezzo = (r ?? {}) as {
    rows?: Record<string, unknown>[];
    affectedRows?: number;
    fields?: unknown[];
  };
  const rows = Array.isArray(grezzo.rows) ? grezzo.rows : [];
  const affected = typeof grezzo.affectedRows === 'number' ? grezzo.affectedRows : null;
  const rowCount = rows.length > 0 ? rows.length : (affected ?? 0);
  return { rows, rowCount, fields: Array.isArray(grezzo.fields) ? grezzo.fields : [] };
}
