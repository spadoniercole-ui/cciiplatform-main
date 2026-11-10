// LA SIMULAZIONE BASE DELLO SCENARIO (0.196.0).
//
// La verifica azienda salva una simulazione come base per l'accordo
// transattivo. Qui si legge quella riga — profilo, annualità e colonne — con
// la guardia sulla tabella assente: gli spazi vecchi valgono «nessuna base»,
// non un errore.

import { pool } from '@/lib/db';
import type { ColonnaVerificaAzienda } from '@/lib/verificaAzienda/simulazione';

export interface SimulazioneBaseLetta {
  id: number;
  profilo: string;
  annualita: number;
  colonne: ColonnaVerificaAzienda[];
  createdAt: string;
}

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

export async function leggiSimulazioneBase(
  nomeSchema: string,
  aziendaId: number
): Promise<SimulazioneBaseLetta | null> {
  if (!schemaOk(nomeSchema)) return null;
  const esistenza = await pool.query(`SELECT to_regclass($1) AS tabella`, [
    `${nomeSchema}.verifica_azienda_simulazioni`,
  ]);
  if (!esistenza.rows[0]?.tabella) return null;

  const r = await pool.query(
    `SELECT id, profilo, annualita, colonne, created_at
       FROM "${nomeSchema}".verifica_azienda_simulazioni
      WHERE azienda_id = $1 AND base_per_proposta = TRUE
      ORDER BY created_at DESC
      LIMIT 1`,
    [aziendaId]
  );
  const riga = r.rows[0];
  if (!riga) return null;

  const colonne = Array.isArray(riga.colonne) ? (riga.colonne as ColonnaVerificaAzienda[]) : [];
  return {
    id: Number(riga.id),
    profilo: String(riga.profilo),
    annualita: Number(riga.annualita),
    colonne,
    createdAt: riga.created_at?.toString() ?? '',
  };
}
