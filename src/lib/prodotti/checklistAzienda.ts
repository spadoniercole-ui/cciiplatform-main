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
// L'ID DEL PRODOTTO NON È UN'IDENTITÀ (0.246.0). Le risposte sono scritte per
// (azienda, prodotto, domanda), ma il prodotto è una riga SERIAL: se viene
// ricreata — un ripristino, una configurazione rinnovata, due ambienti con la
// stessa configurazione e id diversi — l'id cambia e le risposte, che sono
// ancora lì, non si trovano più. Accanto alla risposta si conserva quindi la
// chiave stabile del prodotto (direttrice + nome), e ogni lettura riporta la
// riga sul prodotto di adesso. La risposta non sparisce e non va rifatta.
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
  type ProdottoEnte,
  type SintesiChecklistProdotti,
} from './prodotti';
import { allineaRisposteProdotti, type AllineamentoRisposte } from './risposteProdotti';

const schemaValido = (nomeSchema: string) => /^[a-z0-9_]+$/.test(nomeSchema);

/** I prodotti configurati per lo spazio, nell'ordine in cui sono scritti. */
export async function leggiProdottiAzienda(nomeSchema: string): Promise<ProdottoEnte[]> {
  if (!schemaValido(nomeSchema)) return [];
  await assicuraTabelleTl(nomeSchema);
  const p = await pool.query(
    `SELECT id, direttrice, nome, in_checklist, domande, ordine
       FROM "${nomeSchema}".prodotti_ente
      ORDER BY ordine, id`
  );
  return p.rows.map(rigaProdotto);
}

/**
 * La riga di risposta, riscritta sul prodotto che il prodotto è adesso.
 *
 * Non è una migrazione: è la manutenzione di una lettura. Se l'id è cambiato
 * la riga si scrive PRIMA sul prodotto attuale e SOLO DOPO si toglie quella
 * vecchia: se la scrittura fallisce, la risposta resta dov'era e la lettura
 * la ritrova al giro dopo. Togliere per primi, con un errore in scrittura,
 * significherebbe averla persa per sempre. Se l'id è giusto ma la chiave
 * manca, la chiave si annota e basta.
 */
async function riallineaRisposte(
  nomeSchema: string,
  aziendaId: number,
  esito: AllineamentoRisposte
): Promise<void> {
  for (const r of esito.riallineamenti) {
    await pool.query(
      `INSERT INTO "${nomeSchema}".checklist_prodotti_risposte
         (azienda_id, prodotto_id, domanda_id, prodotto_chiave, si_no, testo, aggiornato_il)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (azienda_id, prodotto_id, domanda_id)
       DO UPDATE SET prodotto_chiave = EXCLUDED.prodotto_chiave`,
      [
        aziendaId,
        r.destinazione.prodottoId,
        r.origine.domandaId,
        r.destinazione.prodottoChiave,
        r.siNo,
        r.testo,
      ]
    );
    // Solo ora la riga vecchia è di troppo: la risposta è già al sicuro sul
    // prodotto attuale.
    if (r.origine.prodottoId !== r.destinazione.prodottoId) {
      await pool.query(
        `DELETE FROM "${nomeSchema}".checklist_prodotti_risposte
          WHERE azienda_id = $1 AND prodotto_id = $2 AND domanda_id = $3`,
        [aziendaId, r.origine.prodottoId, r.origine.domandaId]
      );
    }
  }
}

/**
 * Le risposte di questa azienda, allineate ai prodotti attuali.
 *
 * Le righe che non appartengono più a nessun prodotto restano nel database e
 * non entrano nel quadro: una risposta di un prodotto cancellato non è un
 * errore, è la traccia di una configurazione che c'era.
 */
export async function leggiRisposteChecklistProdottiAzienda(
  nomeSchema: string,
  aziendaId: number,
  prodotti: ProdottoEnte[]
): Promise<AllineamentoRisposte> {
  if (!schemaValido(nomeSchema) || !Number.isInteger(aziendaId) || aziendaId <= 0) {
    return { risposte: [], riallineamenti: [], orfane: 0 };
  }
  await assicuraTabelleTl(nomeSchema);

  const risposteRis = await pool.query(
    `SELECT prodotto_id, prodotto_chiave, domanda_id, si_no, testo
       FROM "${nomeSchema}".checklist_prodotti_risposte
      WHERE azienda_id = $1`,
    [aziendaId]
  );
  const esito = allineaRisposteProdotti(
    risposteRis.rows.map((x) => ({
      prodottoId: Number(x.prodotto_id),
      prodottoChiave: (x.prodotto_chiave as string | null) ?? null,
      domandaId: String(x.domanda_id),
      siNo: x.si_no === null || x.si_no === undefined ? null : x.si_no === true,
      testo: (x.testo as string | null) ?? null,
    })),
    prodotti
  );

  if (esito.riallineamenti.length > 0) {
    await riallineaRisposte(nomeSchema, aziendaId, esito).catch((errore) => {
      console.error('[leggiRisposteChecklistProdottiAzienda] Riallineamento non riuscito:', errore);
    });
  }

  return esito;
}

export async function leggiChecklistProdottiAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<SintesiChecklistProdotti | null> {
  if (!schemaValido(nomeSchema)) return null;
  if (!Number.isInteger(aziendaId) || aziendaId <= 0) return null;

  await assicuraTabelleTl(nomeSchema);

  const prodotti = await leggiProdottiAzienda(nomeSchema);
  const voci = vociChecklistProdotti(prodotti);
  const { risposte } = await leggiRisposteChecklistProdottiAzienda(nomeSchema, aziendaId, prodotti);

  return sintesiChecklistProdotti(voci, risposte);
}
