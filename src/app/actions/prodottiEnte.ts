'use server';

// I PRODOTTI DELL'ENTE E IL PROCESSO OPERATIVO (0.161.0).
//
// Il secondo e il quarto blocco dei Parametri. Il prodotto nasce qui, con il
// flag per la check list e le domande; la TS si associa sempre qui alla coppia
// direttrice/prodotto; il processo — le attività dell'ufficio — vive in
// `processo_prodotto`.
//
// Letture e scritture riservate all'Admin di spazio, come le altre voci dei
// Parametri: sono la configurazione con cui il triage parla all'operatore.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleTl } from '@/db/provision';
import {
  normalizzaProdotto,
  rigaProdotto,
  validaProdotto,
  type InputProdottoEnte,
  type ProdottoEnte,
} from '@/lib/prodotti/prodotti';
import {
  normalizzaProcesso,
  rigaProcesso,
  validaProcesso,
  type InputProcessoProdotto,
  type ProcessoProdotto,
} from '@/lib/prodotti/processoProdotto';
import { sincronizzaDirettriciDaProdotti } from '@/lib/prodotti/sincronizzaServer';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

/** I prodotti dello spazio, nell'ordine di configurazione. */
export async function ottieniProdottiEnte(
  nomeSchema: string
): Promise<{ success: boolean; prodotti: ProdottoEnte[]; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema))
      return { success: false, prodotti: [], error: 'Nome schema non valido.' };
    await assicuraTabelleTl(nomeSchema);
    const r = await pool.query(
      `SELECT id, direttrice, nome, in_checklist, domande, ordine
         FROM "${nomeSchema}".prodotti_ente
        ORDER BY ordine, id`
    );
    return { success: true, prodotti: r.rows.map(rigaProdotto) };
  } catch (error: unknown) {
    console.error('[ottieniProdottiEnte]', error);
    return {
      success: false,
      prodotti: [],
      error: `Impossibile leggere i prodotti: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Crea o aggiorna un prodotto. La coppia (direttrice, nome) è l'identità:
 * due prodotti con lo stesso nome nella stessa direttrice sono lo stesso
 * prodotto, e il database lo rifiuta invece di lasciarli convivere.
 */
export async function salvaProdottoEnteAction(
  nomeSchema: string,
  input: InputProdottoEnte
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaProdotto(input);
    if (errore) return { success: false, error: errore };
    const dato = normalizzaProdotto(input);
    await assicuraTabelleTl(nomeSchema);

    const doppio = await pool.query(
      `SELECT 1 FROM "${nomeSchema}".prodotti_ente
        WHERE lower(btrim(direttrice)) = lower(btrim($1))
          AND lower(btrim(nome)) = lower(btrim($2))
          AND ($3::int IS NULL OR id <> $3::int)`,
      [dato.direttrice, dato.nome, dato.id ?? null]
    );
    if ((doppio.rowCount ?? 0) > 0)
      return {
        success: false,
        error: `Il prodotto «${dato.nome}» esiste già in questa direttrice.`,
      };

    let id: number;
    if (dato.id != null) {
      if (!Number.isInteger(dato.id) || dato.id <= 0)
        return { success: false, error: 'Prodotto non valido.' };
      const r = await pool.query(
        `UPDATE "${nomeSchema}".prodotti_ente
            SET direttrice = $2, nome = $3, in_checklist = $4,
                domande = $5::jsonb, aggiornato_il = now()
          WHERE id = $1
          RETURNING id`,
        [dato.id, dato.direttrice, dato.nome, dato.inChecklist, JSON.stringify(dato.domande)]
      );
      if ((r.rowCount ?? 0) === 0) return { success: false, error: 'Prodotto non trovato.' };
      id = dato.id;
    } else {
      const ordine = await pool.query(
        `SELECT COALESCE(MAX(ordine), 0) + 1 AS n FROM "${nomeSchema}".prodotti_ente`
      );
      const r = await pool.query(
        `INSERT INTO "${nomeSchema}".prodotti_ente
           (direttrice, nome, in_checklist, domande, ordine)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING id`,
        [
          dato.direttrice,
          dato.nome,
          dato.inChecklist,
          JSON.stringify(dato.domande),
          Number(ordine.rows[0]?.n ?? 1),
        ]
      );
      id = Number(r.rows[0].id);
    }

    // La struttura letta dallo screening segue i prodotti, non il contrario.
    await sincronizzaDirettriciDaProdotti(nomeSchema);
    return { success: true, id };
  } catch (error: unknown) {
    console.error('[salvaProdottoEnteAction]', error);
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Elimina un prodotto e ciò che pende da lui: il suo processo e le sue TS
 * restano nel catalogo (la TS è un codice, non un pezzo del prodotto), ma il
 * processo e le risposte di check list non avrebbero più un soggetto.
 */
export async function eliminaProdottoEnteAction(
  nomeSchema: string,
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Prodotto non valido.' };
    await assicuraTabelleTl(nomeSchema);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM "${nomeSchema}".processo_prodotto WHERE prodotto_id = $1`, [
        id,
      ]);
      await client.query(
        `DELETE FROM "${nomeSchema}".checklist_prodotti_risposte WHERE prodotto_id = $1`,
        [id]
      );
      const r = await client.query(
        `DELETE FROM "${nomeSchema}".prodotti_ente WHERE id = $1 RETURNING direttrice, nome`,
        [id]
      );
      if ((r.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Prodotto non trovato.' };
      }
      // Il nome era anche quello dell'associazione nella vecchia catena:
      // senza prodotto, la TS non deve più dichiararlo.
      const vecchio = r.rows[0];
      await client.query(
        `UPDATE "${nomeSchema}".tl SET direttrice = NULL, prodotto = NULL
          WHERE lower(btrim(prodotto)) = lower(btrim($1))
            AND lower(btrim(direttrice)) = lower(btrim($2))`,
        [String(vecchio?.nome ?? ''), String(vecchio?.direttrice ?? '')]
      );
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    await sincronizzaDirettriciDaProdotti(nomeSchema);
    return { success: true };
  } catch (error: unknown) {
    console.error('[eliminaProdottoEnteAction]', error);
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/** Tutti i processi configurati, con il codice della TS, per prodotto. */
export async function ottieniProcessiProdotto(
  nomeSchema: string
): Promise<{ success: boolean; processi: ProcessoProdotto[]; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema))
      return { success: false, processi: [], error: 'Nome schema non valido.' };
    await assicuraTabelleTl(nomeSchema);
    const r = await pool.query(
      `SELECT p.id, p.prodotto_id, p.tl_id, t.codice, t.descrizione,
              p.dipendenza, p.procedura, p.esito, p.ordine
         FROM "${nomeSchema}".processo_prodotto p
         JOIN "${nomeSchema}".tl t ON t.id = p.tl_id
        ORDER BY p.prodotto_id, p.ordine, p.id`
    );
    return { success: true, processi: r.rows.map(rigaProcesso) };
  } catch (error: unknown) {
    console.error('[ottieniProcessiProdotto]', error);
    return {
      success: false,
      processi: [],
      error: `Impossibile leggere il processo operativo: ${(error as Error).message || error}`,
    };
  }
}

/** Crea o aggiorna il processo di un prodotto per una TS. */
export async function salvaProcessoProdottoAction(
  nomeSchema: string,
  input: InputProcessoProdotto
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaProcesso(input);
    if (errore) return { success: false, error: errore };
    const dato = normalizzaProcesso(input);
    await assicuraTabelleTl(nomeSchema);

    const prodotto = await pool.query(
      `SELECT direttrice, nome FROM "${nomeSchema}".prodotti_ente WHERE id = $1`,
      [dato.prodottoId]
    );
    if ((prodotto.rowCount ?? 0) === 0)
      return { success: false, error: 'Prodotto non riconosciuto.' };
    const tl = await pool.query(
      `SELECT codice, descrizione, prodotto, direttrice FROM "${nomeSchema}".tl WHERE id = $1`,
      [dato.tlId]
    );
    if ((tl.rowCount ?? 0) === 0) return { success: false, error: 'TS non riconosciuta.' };

    const p = prodotto.rows[0];
    const t = tl.rows[0];
    // La TS può già essere legata a un altro prodotto: il processo è la
    // dichiarazione che quella TS, SU QUESTO prodotto, si esegue così.
    if (
      t.prodotto &&
      String(t.prodotto).trim().toLowerCase() !== String(p.nome).trim().toLowerCase()
    )
      return {
        success: false,
        error: `La TS ${t.codice} è già associata al prodotto «${t.prodotto}»: scegli una TS libera, o creala nel blocco delle TS per questo prodotto.`,
      };

    // La coppia direttrice/prodotto si allinea alla TS: il processo è la fonte
    // di verità di «quale TS lavora questo prodotto».
    await pool.query(
      `UPDATE "${nomeSchema}".tl
          SET direttrice = $2, prodotto = $3
        WHERE id = $1`,
      [dato.tlId, p.direttrice, p.nome]
    );

    const esistente = await pool.query(
      `SELECT id FROM "${nomeSchema}".processo_prodotto WHERE prodotto_id = $1 AND tl_id = $2`,
      [dato.prodottoId, dato.tlId]
    );
    if ((esistente.rowCount ?? 0) > 0) {
      await pool.query(
        `UPDATE "${nomeSchema}".processo_prodotto
            SET dipendenza = $3, procedura = $4, esito = $5, aggiornato_il = now()
          WHERE prodotto_id = $1 AND tl_id = $2`,
        [dato.prodottoId, dato.tlId, dato.dipendenza, dato.attivita, dato.esito]
      );
      return { success: true };
    }

    const ordine = await pool.query(
      `SELECT COALESCE(MAX(ordine), 0) + 1 AS n
         FROM "${nomeSchema}".processo_prodotto WHERE prodotto_id = $1`,
      [dato.prodottoId]
    );
    await pool.query(
      `INSERT INTO "${nomeSchema}".processo_prodotto
         (prodotto_id, tl_id, dipendenza, procedura, esito, ordine)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        dato.prodottoId,
        dato.tlId,
        dato.dipendenza,
        dato.attivita,
        dato.esito,
        Number(ordine.rows[0]?.n ?? 1),
      ]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[salvaProcessoProdottoAction]', error);
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

/** Toglie una TS dal processo di un prodotto. La TS resta nel catalogo. */
export async function eliminaProcessoProdottoAction(
  nomeSchema: string,
  prodottoId: number,
  tlId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(prodottoId) || prodottoId <= 0 || !Number.isInteger(tlId) || tlId <= 0)
      return { success: false, error: 'Prodotto o TS non valida.' };
    await assicuraTabelleTl(nomeSchema);
    await pool.query(
      `DELETE FROM "${nomeSchema}".processo_prodotto WHERE prodotto_id = $1 AND tl_id = $2`,
      [prodottoId, tlId]
    );
    await pool.query(
      `UPDATE "${nomeSchema}".tl SET direttrice = NULL, prodotto = NULL
        WHERE id = $1`,
      [tlId]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[eliminaProcessoProdottoAction]', error);
    return {
      success: false,
      error: `Rimozione non riuscita: ${(error as Error).message || error}`,
    };
  }
}
