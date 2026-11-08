// src/lib/ponte/persistenza.ts
//
// Una domanda sola, per chi deve sapere se il Piano-ponte esiste già: la
// scheda azienda (per il semaforo dei passi) e lo Screening (per il vincolo
// «prima il ponte»). Non è un'azione: niente elenchi, niente scritture.

import { pool } from '@/lib/db';

export interface StatoPonteAzienda {
  /** C'è un ponte calcolato (o confermato) per l'azienda. */
  esiste: boolean;
  /** L'ultimo stato utile: CALCOLATO o CONFERMATO. */
  stato: 'CALCOLATO' | 'CONFERMATO' | null;
  versione: number | null;
}

const NESSUNO: StatoPonteAzienda = { esiste: false, stato: null, versione: null };

/**
 * L'ultimo Piano-ponte non archiviato dell'azienda. La tabella può non
 * esistere nei tenant non ancora passati dal provisioning: in quel caso, e in
 * ogni errore di lettura, la risposta è «non c'è» — un vincolo non deve mai
 * trasformare un guasto in un blocco senza spiegazione.
 */
export async function esistePonteAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<StatoPonteAzienda> {
  if (!/^[a-zA-Z0-9_]+$/.test(nomeSchema) || !Number.isFinite(aziendaId)) return NESSUNO;
  try {
    const risultato = await pool.query(
      `SELECT stato, versione FROM "${nomeSchema}".ponte_temporale
        WHERE azienda_id = $1 AND stato IN ('CALCOLATO', 'CONFERMATO')
        ORDER BY versione DESC
        LIMIT 1`,
      [aziendaId]
    );
    const riga = risultato.rows[0];
    if (!riga) return NESSUNO;
    return {
      esiste: true,
      stato: riga.stato === 'CONFERMATO' ? 'CONFERMATO' : 'CALCOLATO',
      versione: Number(riga.versione),
    };
  } catch {
    return NESSUNO;
  }
}
