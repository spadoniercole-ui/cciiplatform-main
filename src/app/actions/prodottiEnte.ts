'use server';

// I PRODOTTI DELL'ENTE E IL LORO PROCESSO (0.161.0 → 0.162.0).
//
// Il secondo e il quarto blocco dei Parametri. Il prodotto nasce qui, con il
// flag per la check list e le domande; la TS si associa sempre qui alla coppia
// direttrice/prodotto; il processo — le attività dell'ufficio — vive in
// `processo_prodotto`.
//
// IL PROCESSO È UN'OPERATIVITÀ, NON UNA RIGA PER TS (0.162.0). Si sceglie il
// prodotto, si spuntano le TS che servono a quella operatività e si scrivono le
// attività: la stessa TS può comparire in due operatività diverse dello stesso
// prodotto, e un'operatività può mettere insieme più TS. Le righe salvate
// insieme condividono `gruppo`, così modificarle le tiene allineate.
//
// Letture e scritture riservate all'Admin di spazio, come le altre voci dei
// Parametri: sono la configurazione con cui il triage parla all'operatore.

import { randomUUID } from 'node:crypto';
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
      // senza prodotto, la TS non deve più dichiararlo. Solo se non è usata
      // da nessun altro processo: con le operatività la TS può servire più
      // prodotti, e toglierle l'associazione per uno non deve rompere l'altro.
      const vecchio = r.rows[0];
      await client.query(
        `UPDATE "${nomeSchema}".tl SET direttrice = NULL, prodotto = NULL
          WHERE lower(btrim(prodotto)) = lower(btrim($1))
            AND lower(btrim(direttrice)) = lower(btrim($2))
            AND NOT EXISTS (
              SELECT 1 FROM "${nomeSchema}".processo_prodotto pp
               WHERE pp.tl_id = "${nomeSchema}".tl.id
            )`,
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
      `SELECT p.id, p.prodotto_id, p.tl_id, p.gruppo, t.codice, t.descrizione,
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

/**
 * Crea o aggiorna un'operatività di un prodotto: una o più TS, le attività, il
 * suo ufficio e il suo esito.
 *
 * Il gruppo identifica l'operatività da modificare. Senza gruppo se ne crea una
 * nuova — anche con una TS già usata altrove: le TS non si escludono. Una riga
 * scritta prima dei gruppi si modifica passando la sua chiave `r<id>`: viene
 * riscritta come operatività, senza lasciare la vecchia dietro.
 */
export async function salvaProcessoProdottoAction(
  nomeSchema: string,
  input: InputProcessoProdotto
): Promise<{ success: boolean; gruppo?: string; error?: string }> {
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

    // Le TS devono esistere davvero: il browser manda id, non codici.
    const ts = await pool.query(`SELECT id FROM "${nomeSchema}".tl WHERE id = ANY($1::int[])`, [
      dato.tlIds,
    ]);
    if ((ts.rowCount ?? 0) !== dato.tlIds.length)
      return {
        success: false,
        error: 'Una delle TS scelte non esiste più nel catalogo: ricarica la pagina.',
      };

    const p = prodotto.rows[0];

    const client = await pool.connect();
    let gruppo: string = randomUUID();
    try {
      await client.query('BEGIN');

      // La riga da modificare: un gruppo esistente, oppure una riga scritta
      // prima dei gruppi. Il vecchio ordine si conserva, così la voce non
      // salta in fondo all'elenco per essere stata corretta.
      let ordine: number | null = null;
      const chiave = dato.gruppo ?? '';
      const legacy = /^r(\d+)$/.exec(chiave);
      if (legacy) {
        const vecchia = await client.query(
          `SELECT ordine FROM "${nomeSchema}".processo_prodotto
            WHERE id = $1 AND prodotto_id = $2`,
          [Number(legacy[1]), dato.prodottoId]
        );
        if ((vecchia.rowCount ?? 0) > 0) {
          ordine = Number(vecchia.rows[0].ordine);
          await client.query(`DELETE FROM "${nomeSchema}".processo_prodotto WHERE id = $1`, [
            Number(legacy[1]),
          ]);
        }
      } else if (chiave) {
        const vecchio = await client.query(
          `SELECT MIN(ordine) AS ordine FROM "${nomeSchema}".processo_prodotto
            WHERE prodotto_id = $1 AND gruppo = $2`,
          [dato.prodottoId, chiave]
        );
        if (vecchio.rows[0]?.ordine != null) {
          ordine = Number(vecchio.rows[0].ordine);
          gruppo = chiave;
          await client.query(
            `DELETE FROM "${nomeSchema}".processo_prodotto
              WHERE prodotto_id = $1 AND gruppo = $2`,
            [dato.prodottoId, chiave]
          );
        }
      }

      if (ordine === null) {
        const massimo = await client.query(
          `SELECT COALESCE(MAX(ordine), 0) + 1 AS n
             FROM "${nomeSchema}".processo_prodotto WHERE prodotto_id = $1`,
          [dato.prodottoId]
        );
        ordine = Number(massimo.rows[0]?.n ?? 1);
      }

      for (const tlId of dato.tlIds) {
        await client.query(
          `INSERT INTO "${nomeSchema}".processo_prodotto
             (prodotto_id, tl_id, gruppo, dipendenza, procedura, esito, ordine)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [dato.prodottoId, tlId, gruppo, dato.dipendenza, dato.attivita, dato.esito, ordine]
        );
      }

      // La TS conserva il prodotto in cui è nata: un'operatività su un altro
      // prodotto non glielo cambia, e non la toglie a chi la usava.
      await client.query(
        `UPDATE "${nomeSchema}".tl
            SET direttrice = COALESCE(NULLIF(btrim(direttrice), ''), $2),
                prodotto = COALESCE(NULLIF(btrim(prodotto), ''), $3)
          WHERE id = ANY($1::int[])`,
        [dato.tlIds, p.direttrice, p.nome]
      );

      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    return { success: true, gruppo };
  } catch (error: unknown) {
    console.error('[salvaProcessoProdottoAction]', error);
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Toglie un'operatività dal processo di un prodotto. Le TS restano nel
 * catalogo: sono codici, non pezzi del prodotto.
 */
export async function eliminaProcessoProdottoAction(
  nomeSchema: string,
  prodottoId: number,
  chiave: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(prodottoId) || prodottoId <= 0)
      return { success: false, error: 'Prodotto non valido.' };
    const gruppo = String(chiave ?? '').trim();
    if (!gruppo) return { success: false, error: 'Operatività non valida.' };
    await assicuraTabelleTl(nomeSchema);

    // Una riga scritta prima dei gruppi si identifica con la sua chiave `r<id>`.
    const legacy = /^r(\d+)$/.exec(gruppo);
    if (legacy) {
      await pool.query(
        `DELETE FROM "${nomeSchema}".processo_prodotto WHERE id = $1 AND prodotto_id = $2`,
        [Number(legacy[1]), prodottoId]
      );
    } else {
      await pool.query(
        `DELETE FROM "${nomeSchema}".processo_prodotto WHERE prodotto_id = $1 AND gruppo = $2`,
        [prodottoId, gruppo]
      );
    }
    return { success: true };
  } catch (error: unknown) {
    console.error('[eliminaProcessoProdottoAction]', error);
    return {
      success: false,
      error: `Rimozione non riuscita: ${(error as Error).message || error}`,
    };
  }
}
