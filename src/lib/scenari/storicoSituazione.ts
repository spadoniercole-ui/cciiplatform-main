// LA CRONOLOGIA DELLA SITUAZIONE (0.190.0).
//
// Ogni cambio lascia una riga: da che atto a che atto, e quando. La scheda la
// mostra in forma compatta; nulla si cancella quando la situazione cambia.
//
// La tabella può non esistere su uno spazio vecchio (il provisioning è lazy):
// l'assenza vale «nessuna cronologia», non un errore.

import { pool } from '@/lib/db';

export interface VoceStoricoSituazione {
  da: string | null;
  a: string;
  cambiataIl: string;
}

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

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
    `SELECT da, a, cambiata_il FROM "${nomeSchema}".situazione_storico
      WHERE scenario_id = $1
      ORDER BY cambiata_il DESC, id DESC
      LIMIT $2`,
    [scenarioId, limite]
  );
  return r.rows.map((voce) => {
    const quando = voce.cambiata_il;
    return {
      da: (voce.da as string | null) ?? null,
      a: voce.a as string,
      cambiataIl: quando instanceof Date ? quando.toISOString() : quandoTesto(quando),
    };
  });
}

function quandoTesto(valore: unknown): string {
  return typeof valore === 'string' ? valore : '';
}
