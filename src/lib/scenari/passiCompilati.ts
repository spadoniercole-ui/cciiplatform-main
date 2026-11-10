// LEGGERE CHE COSA È GIÀ STATO COMPILATO SU UNO SCENARIO.
//
// Serve al cambio di situazione: prima di dire «torna in bozza» bisogna sapere
// se c'è qualcosa da riguardare, e quanto. Le tabelle possono non esistere su
// uno spazio vecchio (il provisioning è lazy): l'assenza vale zero, non un
// errore.

import { pool } from '@/lib/db';
import type { PassiCompilati } from '@/lib/scenari/situazione';

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

const VUOTO: PassiCompilati = { propostaRighe: 0, risposteChecklist: 0 };

async function conta(
  nomeSchema: string,
  tabella: 'proposta_creditori' | 'checklist_risposte',
  filtro: string,
  scenarioId: number
): Promise<number> {
  const esistenza = await pool.query(`SELECT to_regclass($1) AS tabella`, [
    `${nomeSchema}.${tabella}`,
  ]);
  if (!esistenza.rows[0]?.tabella) return 0;
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM "${nomeSchema}".${tabella} WHERE scenario_id = $1 AND ${filtro}`,
    [scenarioId]
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function leggiPassiCompilati(
  nomeSchema: string,
  scenarioId: number
): Promise<PassiCompilati> {
  if (!schemaOk(nomeSchema)) return VUOTO;
  const [propostaRighe, risposteChecklist] = await Promise.all([
    conta(nomeSchema, 'proposta_creditori', 'true', scenarioId),
    conta(nomeSchema, 'checklist_risposte', 'risposta IS NOT NULL', scenarioId),
  ]);
  return { propostaRighe, risposteChecklist };
}
