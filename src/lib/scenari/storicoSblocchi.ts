// LA CRONOLOGIA DEGLI SBLOCCHI (0.193.0).
//
// Sbloccare uno scenario in sola lettura è un atto, non un interruttore: chi lo
// fa deve dichiarare un motivo, e quel motivo resta. La scheda ne mostra gli
// ultimi; la pagina della cronologia li riporta tutti, così la traccia è
// consultabile senza aprire il database.
//
// La tabella può non esistere su uno spazio vecchio (il provisioning è lazy):
// l'assenza vale «nessuno sblocco», non un errore.

import { pool } from '@/lib/db';

export interface VoceSbloccoScenario {
  motivo: string;
  /** Chi ha sbloccato lo scenario: email dalla sessione, mai dal browser. */
  sbloccatoDa: string | null;
  sbloccatoIl: string;
}

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

const iso = (valore: unknown): string | null => {
  if (!valore) return null;
  return valore instanceof Date ? valore.toISOString() : String(valore);
};

export async function leggiStoricoSblocchi(
  nomeSchema: string,
  scenarioId: number,
  limite = 5
): Promise<VoceSbloccoScenario[]> {
  if (!schemaOk(nomeSchema)) return [];
  const esistenza = await pool.query(`SELECT to_regclass($1) AS tabella`, [
    `${nomeSchema}.scenario_sblocchi`,
  ]);
  if (!esistenza.rows[0]?.tabella) return [];
  const r = await pool.query(
    `SELECT motivo, sbloccato_da, sbloccato_il
       FROM "${nomeSchema}".scenario_sblocchi
      WHERE scenario_id = $1
      ORDER BY sbloccato_il DESC, id DESC
      LIMIT $2`,
    [scenarioId, limite]
  );
  return r.rows.map((voce) => ({
    motivo: (voce.motivo as string) ?? '',
    sbloccatoDa: (voce.sbloccato_da as string | null) ?? null,
    sbloccatoIl: iso(voce.sbloccato_il) ?? '',
  }));
}
