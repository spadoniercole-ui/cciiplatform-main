// LA VALUTAZIONE PESATA DELLA CHECK LIST, LETTA UNA VOLTA (0.241.0).
//
// La check list dei prodotti si conta (quante risposte chiuse sono negative);
// la Check List ministeriale si pesa (percentuale di criticità con i pesi delle
// domande). L'indicatore amministrativo le mette accanto e legge la più severa,
// e la stessa percentuale serve al testo della scheda: se ognuno la calcolasse
// per conto suo, le due frasi potrebbero divergere.
//
// Qui c'è solo la lettura: la logica del quadro sta in scoring.ts, con i suoi
// test. Nessun default: senza risposte la percentuale è null, non zero.

import { pool } from '@/lib/db';
import { CHECKLIST_MINISTERIALE } from '@/lib/checklist/ministeriale';
import { calcolaQuadroQualitativo, type RispostaPerCalcolo } from '@/lib/checklist/scoring';

export async function leggiPercentualeCriticitaPesata(
  nomeSchema: string,
  aziendaId: number
): Promise<number | null> {
  if (!/^[a-z0-9_]+$/.test(nomeSchema)) return null;
  try {
    const r = await pool.query(
      `SELECT domanda_id, risposta
         FROM "${nomeSchema}".azienda_checklist_ministeriale_risposte
        WHERE azienda_id = $1`,
      [aziendaId]
    );
    if (r.rows.length === 0) return null;
    const risposte: Record<string, RispostaPerCalcolo> = {};
    for (const riga of r.rows) {
      const id = String(riga.domanda_id);
      risposte[id] = {
        domandaId: id,
        risposta:
          riga.risposta === null || riga.risposta === undefined ? null : Boolean(riga.risposta),
      };
    }
    return calcolaQuadroQualitativo(CHECKLIST_MINISTERIALE, risposte)
      .percentualeCriticitaComplessiva;
  } catch {
    return null;
  }
}
