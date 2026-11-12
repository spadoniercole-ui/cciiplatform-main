// LA CRONOLOGIA DELL'ESITO DELLA PROPOSTA (0.213.0).
//
// L'esito non è un'etichetta che si cambia in silenzio: è ciò che lo scenario
// dichiara di stare valutando, e chi lo cambia lo firma con il PIN del secondo
// fattore. Qui si legge la traccia — da che esito a che esito, quando e chi.
// La tabella nasce al primo cambio: se non c'è, la cronologia è vuota, non un
// errore.

import { pool } from '@/lib/db';

export interface VoceStoricoEsitoProposta {
  da: string | null;
  a: string | null;
  cambiatoIl: string;
  autore: string | null;
}

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

const iso = (valore: unknown): string | null => {
  if (!valore) return null;
  return valore instanceof Date ? valore.toISOString() : String(valore);
};

export async function leggiStoricoEsitoProposta(
  nomeSchema: string,
  scenarioId: number,
  limite = 5
): Promise<VoceStoricoEsitoProposta[]> {
  if (!schemaOk(nomeSchema)) return [];
  const esistenza = await pool.query(`SELECT to_regclass($1) AS tabella`, [
    `${nomeSchema}.esito_proposta_storico`,
  ]);
  if (!esistenza.rows[0]?.tabella) return [];
  const r = await pool.query(
    `SELECT da, a, cambiato_il, autore
       FROM "${nomeSchema}".esito_proposta_storico
      WHERE scenario_id = $1
      ORDER BY cambiato_il DESC, id DESC
      LIMIT $2`,
    [scenarioId, limite]
  );
  return r.rows.map((voce) => ({
    da: (voce.da as string | null) ?? null,
    a: (voce.a as string | null) ?? null,
    cambiatoIl: iso(voce.cambiato_il) ?? '',
    autore: (voce.autore as string | null) ?? null,
  }));
}
