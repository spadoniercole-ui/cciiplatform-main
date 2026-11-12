// L'ESITO DELLA PROPOSTA, LETTO DALLA SUA COLONNA (0.214.0).
//
// L'esito vive in `scenari.esito_proposta` e non passa da Drizzle: qui c'è una
// sola lettura, con lo stesso criterio in tutti i punti che lo mostrano —
// assenza o valore illeggibile valgono «non dichiarato». La scrittura resta
// nell'azione, sotto PIN.

import { pool } from '@/lib/db';
import { esitoPropostaValido, type EsitoProposta } from '@/lib/scenari/esitoProposta';

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

export async function leggiEsitoPropostaCorrente(
  nomeSchema: string,
  scenarioId: number
): Promise<EsitoProposta | null> {
  if (!schemaOk(nomeSchema)) return null;
  const righe = await pool
    .query(`SELECT esito_proposta FROM "${nomeSchema}".scenari WHERE id = $1`, [scenarioId])
    .catch(() => null);
  const valore = righe?.rows[0]?.esito_proposta;
  return esitoPropostaValido(valore) ? valore : null;
}
