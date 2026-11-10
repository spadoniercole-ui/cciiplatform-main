// LA CRONOLOGIA DELLA SITUAZIONE (0.190.0).
//
// Ogni cambio lascia una riga: da che atto a che atto, quando e chi. La scheda
// la mostra in forma compatta; nulla si cancella quando la situazione cambia.
// L'Admin di Spazio può annullare l'ultimo cambio (0.191.0): la riga resta,
// marcata «annullato» con chi l'ha annullata (0.192.0), così la traccia dice
// anche che cosa è stato corretto e da chi.
//
// La tabella può non esistere su uno spazio vecchio (il provisioning è lazy):
// l'assenza vale «nessuna cronologia», non un errore.

import { pool } from '@/lib/db';

export interface VoceStoricoSituazione {
  da: string | null;
  a: string;
  cambiataIl: string;
  /** Chi ha cambiato la situazione: email dalla sessione, mai dal browser. */
  autore: string | null;
  /** Valorizzato se il cambio è stato annullato da un Admin di Spazio. */
  annullatoIl: string | null;
  /** Chi ha annullato il cambio. */
  annullatoDa: string | null;
}

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

const iso = (valore: unknown): string | null => {
  if (!valore) return null;
  return valore instanceof Date ? valore.toISOString() : String(valore);
};

export async function leggiStoricoSituazione(
  nomeSchema: string,
  scenarioId: number,
  limite = 5
): Promise<VoceStoricoSituazione[]> {
  if (!schemaOk(nomeSchema)) return [];
  const esistenza = await pool.query(`SELECT to_regclass($1) AS tabella`, [
    `${nomeSchema}.situazione_storico`,
  ]);
  if (!esistenza.rows[0]?.tabella) return [];
  const r = await pool.query(
    `SELECT da, a, cambiata_il, autore, annullato_il, annullato_da
       FROM "${nomeSchema}".situazione_storico
      WHERE scenario_id = $1
      ORDER BY cambiata_il DESC, id DESC
      LIMIT $2`,
    [scenarioId, limite]
  );
  return r.rows.map((voce) => ({
    da: (voce.da as string | null) ?? null,
    a: voce.a as string,
    cambiataIl: iso(voce.cambiata_il) ?? '',
    autore: (voce.autore as string | null) ?? null,
    annullatoIl: iso(voce.annullato_il),
    annullatoDa: (voce.annullato_da as string | null) ?? null,
  }));
}
