// src/lib/prodotti/checklistAzienda.ts
//
// LA CHECK LIST DEI PRODOTTI DI UNA AZIENDA, letta dal database (0.168.0).
//
// È la sola check list che il sistema usa per la parte ricevente: le domande
// sono quelle scritte sui prodotti con il flag attivo, le risposte sono di
// questa azienda. Il triage la compila e la stampa; la Relazione del Ricevente
// la cita come quadro qualitativo. Nessuna delle due deve leggere una
// configurazione diversa, altrimenti lo stesso fatto avrebbe due letture.
//
// Vive fuori dai file 'use server' perché è un helper: la guardia la mette
// l'azione che la chiama, e il nome dello schema è già validato lì. Il nome
// viene comunque controllato prima di entrare nell'SQL, perché un helper
// richiamato domani da un'altra azione non deve poter diventare una falla.

import { pool } from '@/lib/db';
import { assicuraTabelleTl } from '@/db/provision';
import {
  rigaProdotto,
  sintesiChecklistProdotti,
  vociChecklistProdotti,
  type RispostaChecklistProdotto,
  type SintesiChecklistProdotti,
} from './prodotti';

export async function leggiChecklistProdottiAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<SintesiChecklistProdotti | null> {
  if (!/^[a-z0-9_]+$/.test(nomeSchema)) return null;
  if (!Number.isInteger(aziendaId) || aziendaId <= 0) return null;

  await assicuraTabelleTl(nomeSchema);

  const prodottiRis = await pool.query(
    `SELECT id, direttrice, nome, in_checklist, domande, ordine
       FROM "${nomeSchema}".prodotti_ente
      ORDER BY ordine, id`
  );
  const voci = vociChecklistProdotti(prodottiRis.rows.map(rigaProdotto));

  const risposteRis = await pool.query(
    `SELECT prodotto_id, domanda_id, si_no, testo
       FROM "${nomeSchema}".checklist_prodotti_risposte
      WHERE azienda_id = $1`,
    [aziendaId]
  );
  const risposte: RispostaChecklistProdotto[] = risposteRis.rows.map((x) => ({
    prodottoId: Number(x.prodotto_id),
    domandaId: String(x.domanda_id),
    siNo: x.si_no === null || x.si_no === undefined ? null : x.si_no === true,
    testo: (x.testo as string | null) ?? null,
  }));

  return sintesiChecklistProdotti(voci, risposte);
}
