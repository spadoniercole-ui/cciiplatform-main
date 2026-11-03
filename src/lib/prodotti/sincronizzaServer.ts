// src/lib/prodotti/sincronizzaServer.ts
//
// L'AGGIORNAMENTO DELLA STRUTTURA DELLE DIRETTRICI, DAL DATABASE (0.161.0).
//
// Vive fuori dai file 'use server' perché è un helper, non un endpoint: la
// guardia la mette l'azione che la chiama. Serve a due azioni — il salvataggio
// dei prodotti e il salvataggio delle direttrici — perché entrambe devono
// lasciare `spazi.direttrici_ente_strutturate` coerente con la tabella dei
// prodotti, altrimenti lo screening genera sezioni su prodotti che non
// esistono più (o non vede quelli appena creati).
//
// Se la tabella dei prodotti non c'è ancora (spazio fermo a una versione
// precedente), non si inventa nulla: si restituisce quello che c'era.

import { pool } from '@/lib/db';
import { sincronizzaDirettrici, type DirettriceConProdotti } from './sincronizza';

export async function sincronizzaDirettriciDaProdotti(nomeSchema: string): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(nomeSchema)) return;

  const spazi = await pool.query(
    `SELECT direttrici_ente_strutturate FROM public.spazi WHERE nome_schema = $1`,
    [nomeSchema]
  );
  const esistenti =
    (spazi.rows[0]?.direttrici_ente_strutturate as DirettriceConProdotti[] | null) ?? [];

  const prodotti = await pool
    .query(`SELECT direttrice, nome FROM "${nomeSchema}".prodotti_ente ORDER BY ordine, id`)
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));

  const aggiornate = sincronizzaDirettrici(
    esistenti,
    prodotti.rows.map((r) => ({
      direttrice: String(r.direttrice ?? ''),
      nome: String(r.nome ?? ''),
    }))
  );

  await pool.query(
    `UPDATE public.spazi SET direttrici_ente_strutturate = $1 WHERE nome_schema = $2`,
    [JSON.stringify(aggiornate), nomeSchema]
  );
}
