'use server';

// IL CATALOGO DELLE TS, LE ASSOCIAZIONI DELLE MATERIE, IL RIALLINEAMENTO (0.159.0).
//
// Lo schema è semplice, e in tre passi:
//
//   1. `tl` — il catalogo: codice, descrizione, flag per la check list. Il
//      codice della TS è unico dentro il prodotto, non nello spazio (0.167.0).
//   2. `materia_tl` — la materia mutua la coppia direttrice/prodotto e porta il
//      processo (ufficio, passi, esito). È qui che la TS diventa una lavorazione
//      concreta, ed è da qui che nascono il report per unità operativa e le
//      comunicazioni.
//   3. `titoli_ente` — il codice di partita mette insieme TS, direttrice e
//      prodotto: è la vestizione legale, cioè il presupposto su cui l'ente fonda
//      la richiesta.
//
// Prima la TS stava dentro il prodotto (`prodotti_tl`): la stessa TS era
// scritta tante volte quanti erano i prodotti che la usavano, e ogni copia
// portava il suo ufficio. La migrazione in `src/db/provision.ts` porta i dati
// nel nuovo schema; `prodotti_tl` resta come storico e non viene più letta.
//
// Letture e scritture riservate all'Admin di spazio, come le altre voci dei
// Parametri.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleParametriSpazio, assicuraTabelleTl } from '@/db/provision';
import {
  chiaveTl,
  conflittoCodiceTl,
  normalizzaTl,
  rigaTl,
  validaTl,
  type InputTl,
  type Tl,
} from '@/lib/titoliEnte/catalogoTl';
import {
  normalizzaAssociazioneTl,
  validaAssociazioneTl,
  type InputAssociazioneTl,
  type LavorazioneMateria,
} from '@/lib/titoliEnte/lavorazioniMateria';
import { grafiaGiaUsata, registroDipendenze } from '@/lib/lavorazioni/dipendenze';
import {
  direttriceConfigurata,
  nomiDirettrici,
  pianificaRiallineamento,
} from '@/lib/titoliEnte/direttrici';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

/**
 * Le grafie degli uffici già configurate nello spazio, dalla più autorevole
 * alla più vecchia: prima le associazioni delle materie (la configurazione di
 * oggi), poi i titoli dei codici, infine la tabella per tipologia di debito
 * (congelata, ma i suoi destinatari sono ancora quelli che ricevono i
 * documenti).
 *
 * Serve a una cosa sola: chi scrive «ufficio contributi» dove esiste già
 * «Ufficio Contributi» salva la grafia che c'è. Lo stesso ufficio smette così
 * di dividersi in due documenti diversi.
 */
async function grafieDegliUffici(nomeSchema: string, escludiId: number | null): Promise<string[]> {
  const leggi = async (sql: string, parametri: unknown[], campo: string): Promise<string[]> => {
    try {
      const r = await pool.query(sql, parametri);
      return r.rows.map((x) => String(x[campo] ?? ''));
    } catch {
      return [];
    }
  };

  return [
    ...(await leggi(
      `SELECT DISTINCT dipendenza FROM "${nomeSchema}".materia_tl
        WHERE dipendenza IS NOT NULL AND btrim(dipendenza) <> ''
          AND ($1::int IS NULL OR id <> $1::int)
        ORDER BY dipendenza`,
      [escludiId],
      'dipendenza'
    )),
    ...(await leggi(
      `SELECT DISTINCT dipendenza FROM "${nomeSchema}".titoli_ente
        WHERE dipendenza IS NOT NULL AND btrim(dipendenza) <> ''
        ORDER BY dipendenza`,
      [],
      'dipendenza'
    )),
    ...(await leggi(
      `SELECT DISTINCT destinatario FROM "${nomeSchema}".lavorazioni_tipo_debito
        WHERE btrim(destinatario) <> ''
        ORDER BY destinatario`,
      [],
      'destinatario'
    )),
  ];
}

/** I nomi delle direttrici dello spazio: sono loro a dare il nome all'ufficio. */
async function direttriciDelloSpazio(nomeSchema: string): Promise<string[]> {
  try {
    const r = await pool.query(
      `SELECT direttrici_ente_strutturate FROM public.spazi WHERE nome_schema = $1`,
      [nomeSchema]
    );
    return nomiDirettrici(
      (r.rows[0]?.direttrici_ente_strutturate as { nome: string }[] | null) ?? []
    );
  } catch {
    return [];
  }
}

/** La grafia canonica dell'ufficio: quella delle direttrici, o quella già in uso. */
async function ufficioCanonico(
  nomeSchema: string,
  dipendenza: string | null,
  escludiId: number | null
): Promise<string | null> {
  if (!dipendenza) return null;
  const direttrici = await direttriciDelloSpazio(nomeSchema);
  const registro = registroDipendenze(await grafieDegliUffici(nomeSchema, escludiId));
  return (
    direttriceConfigurata(dipendenza, direttrici) ??
    grafiaGiaUsata(dipendenza, registro) ??
    dipendenza
  );
}

function daRigaLavorazione(r: Record<string, unknown>): LavorazioneMateria {
  return {
    id: Number(r.id),
    materiaId: Number(r.materia_id),
    codice: String(r.codice ?? ''),
    tipologia: String(r.descrizione ?? ''),
    direttrice: String(r.direttrice ?? ''),
    prodotto: String(r.prodotto ?? ''),
    dipendenza: (r.dipendenza as string | null) ?? null,
    procedura: (r.procedura as string | null) ?? null,
    esito: (r.esito as string | null) ?? null,
    ordine: Number(r.ordine ?? 0),
    rilevantePerimetro: r.check_list === true,
    versoPerimetro:
      r.verso_check_list === 'COLLABORATIVA' || r.verso_check_list === 'RESISTENZA'
        ? r.verso_check_list
        : null,
  };
}

/**
 * Le TS che una materia applica, nella forma che tutte le letture conoscono.
 *
 * L'ordine è quello della materia (poi quello del catalogo): è la sequenza in
 * cui l'ufficio le esegue, e la prima è quella che il titolo del codice
 * eredita.
 */
export async function ottieniLavorazioniMateria(
  nomeSchema: string
): Promise<{ success: boolean; lavorazioni: LavorazioneMateria[]; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema))
      return { success: false, lavorazioni: [], error: 'Nome schema non valido.' };
    await assicuraTabelleTl(nomeSchema);
    const r = await pool.query(
      `SELECT t.id, a.materia_id, t.codice, t.descrizione,
              a.direttrice, a.prodotto, a.dipendenza, a.procedura, a.esito,
              a.ordine, t.check_list, t.verso_check_list
         FROM "${nomeSchema}".materia_tl a
         JOIN "${nomeSchema}".tl t ON t.id = a.tl_id
        ORDER BY a.materia_id, a.ordine ASC, t.id ASC`
    );
    return { success: true, lavorazioni: r.rows.map(daRigaLavorazione) };
  } catch (error: unknown) {
    console.error('[ottieniLavorazioniMateria]', error);
    return {
      success: false,
      lavorazioni: [],
      error: `Impossibile leggere le lavorazioni delle materie: ${(error as Error).message || error}`,
    };
  }
}

/** Il catalogo completo, con quante materie usano ogni TS. */
export async function ottieniCatalogoTl(
  nomeSchema: string
): Promise<{ success: boolean; tl: Tl[]; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema))
      return { success: false, tl: [], error: 'Nome schema non valido.' };
    await assicuraTabelleTl(nomeSchema);
    const r = await pool.query(
      `SELECT t.id, t.codice, t.descrizione, t.check_list, t.verso_check_list, t.ordine,
              t.direttrice, t.prodotto, t.prodotti,
              (SELECT COUNT(*) FROM "${nomeSchema}".materia_tl a WHERE a.tl_id = t.id) AS materie
         FROM "${nomeSchema}".tl t
        ORDER BY t.ordine, t.codice, t.id`
    );
    return { success: true, tl: r.rows.map(rigaTl) };
  } catch (error: unknown) {
    console.error('[ottieniCatalogoTl]', error);
    return {
      success: false,
      tl: [],
      error: `Impossibile leggere il catalogo delle TS: ${(error as Error).message || error}`,
    };
  }
}

/** Crea o aggiorna una TS del catalogo. */
export async function salvaTlAction(
  nomeSchema: string,
  input: InputTl
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaTl(input);
    if (errore) return { success: false, error: errore };
    const dato = normalizzaTl(input);
    await assicuraTabelleTl(nomeSchema);

    // UNA TS, PIÙ PRODOTTI (0.166.0). Le associazioni vivono nell'elenco; la
    // coppia singola resta scritta con la prima, perché le letture che ne
    // mostrano una sola la trovano senza dover leggere il jsonb.
    const prodotti = dato.prodotti ?? [];
    const primo = prodotti[0] ?? null;

    // LO STESSO CODICE VALE DENTRO UN PRODOTTO (0.167.0). La numerazione delle
    // TS riparte per prodotto: la 81 di «Diffida M400» e la 81 di «Diffida
    // sgravi contributivi» sono due lavorazioni, con descrizione e processo
    // propri. Il divieto resta sul doppione vero — stesso codice sullo stesso
    // prodotto — e sulle TS senza prodotto, che senza posto non si distinguono.
    const stesse = await pool.query(
      `SELECT id, codice, prodotti, direttrice, prodotto
         FROM "${nomeSchema}".tl
        WHERE lower(btrim(codice)) = $1 AND ($2::int IS NULL OR id <> $2::int)`,
      [chiaveTl(dato.codice), dato.id ?? null]
    );
    const conflitto = conflittoCodiceTl(dato.codice, prodotti, stesse.rows.map(rigaTl));
    if (conflitto) return { success: false, error: conflitto };

    if (dato.id != null) {
      if (!Number.isInteger(dato.id) || dato.id <= 0)
        return { success: false, error: 'TS non valida.' };
      const r = await pool.query(
        `UPDATE "${nomeSchema}".tl
            SET codice = $2, descrizione = $3, check_list = $4,
                verso_check_list = $5, direttrice = $6, prodotto = $7,
                prodotti = $8::jsonb, aggiornato_il = now()
          WHERE id = $1
          RETURNING id`,
        [
          dato.id,
          dato.codice,
          dato.descrizione,
          dato.checkList === true,
          dato.versoCheckList,
          primo?.direttrice ?? null,
          primo?.prodotto ?? null,
          JSON.stringify(prodotti),
        ]
      );
      if ((r.rowCount ?? 0) === 0) return { success: false, error: 'TS non trovata.' };
      return { success: true, id: dato.id };
    }

    const ordine = await pool.query(
      `SELECT COALESCE(MAX(ordine), 0) + 1 AS n FROM "${nomeSchema}".tl`
    );
    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".tl
         (codice, descrizione, check_list, verso_check_list, ordine, direttrice, prodotto, prodotti)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        dato.codice,
        dato.descrizione,
        dato.checkList === true,
        dato.versoCheckList,
        Number(ordine.rows[0]?.n ?? 1),
        primo?.direttrice ?? null,
        primo?.prodotto ?? null,
        JSON.stringify(prodotti),
      ]
    );
    return { success: true, id: Number(r.rows[0].id) };
  } catch (error: unknown) {
    console.error('[salvaTlAction]', error);
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Toglie una TS dal catalogo, con le associazioni alle materie e i collegamenti
 * alle categorie di debito.
 *
 * Le risposte della check di perimetro restano dove sono: una risposta orfana
 * non blocca nulla — il triage legge solo le TS esistenti.
 */
export async function eliminaTlAction(
  nomeSchema: string,
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'TS non valida.' };
    await assicuraTabelleTl(nomeSchema);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM "${nomeSchema}".materia_tl WHERE tl_id = $1`, [id]);
      await client.query(`DELETE FROM "${nomeSchema}".categoria_tl WHERE tl_id = $1`, [id]);
      const r = await client.query(`DELETE FROM "${nomeSchema}".tl WHERE id = $1 RETURNING id`, [
        id,
      ]);
      if ((r.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'TS non trovata.' };
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }
    return { success: true };
  } catch (error: unknown) {
    console.error('[eliminaTlAction]', error);
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/**
 * La materia applica una TS a una direttrice e a un prodotto, con il processo
 * dell'ufficio. Crea l'associazione o la aggiorna: la coppia (materia, TS) è
 * la chiave.
 *
 * Il nome dell'ufficio viene ricondotto alla grafia configurata: due nomi per
 * lo stesso ufficio sono due documenti.
 */
export async function salvaAssociazioneTlAction(
  nomeSchema: string,
  input: InputAssociazioneTl
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaAssociazioneTl(input);
    if (errore) return { success: false, error: errore };
    const dato = normalizzaAssociazioneTl(input);
    await assicuraTabelleTl(nomeSchema);

    const materia = await pool.query(`SELECT 1 FROM "${nomeSchema}".materie_ente WHERE id = $1`, [
      dato.materiaId,
    ]);
    if ((materia.rowCount ?? 0) === 0)
      return { success: false, error: 'Materia non riconosciuta.' };
    const tl = await pool.query(`SELECT 1 FROM "${nomeSchema}".tl WHERE id = $1`, [dato.tlId]);
    if ((tl.rowCount ?? 0) === 0) return { success: false, error: 'TS non riconosciuta.' };

    const dipendenza = await ufficioCanonico(nomeSchema, dato.dipendenza, null);

    const esistente = await pool.query(
      `SELECT id FROM "${nomeSchema}".materia_tl WHERE materia_id = $1 AND tl_id = $2`,
      [dato.materiaId, dato.tlId]
    );
    if ((esistente.rowCount ?? 0) > 0) {
      await pool.query(
        `UPDATE "${nomeSchema}".materia_tl
            SET direttrice = $3, prodotto = $4, dipendenza = $5, procedura = $6, esito = $7
          WHERE materia_id = $1 AND tl_id = $2`,
        [
          dato.materiaId,
          dato.tlId,
          dato.direttrice,
          dato.prodotto,
          dipendenza,
          dato.procedura,
          dato.esito,
        ]
      );
      return { success: true };
    }

    const ordine = await pool.query(
      `SELECT COALESCE(MAX(ordine), 0) + 1 AS n
         FROM "${nomeSchema}".materia_tl WHERE materia_id = $1`,
      [dato.materiaId]
    );
    await pool.query(
      `INSERT INTO "${nomeSchema}".materia_tl
         (materia_id, tl_id, ordine, direttrice, prodotto, dipendenza, procedura, esito)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        dato.materiaId,
        dato.tlId,
        Number(ordine.rows[0]?.n ?? 1),
        dato.direttrice,
        dato.prodotto,
        dipendenza,
        dato.procedura,
        dato.esito,
      ]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[salvaAssociazioneTlAction]', error);
    return {
      success: false,
      error: `Associazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/** La materia smette di applicare una TS. La TS resta nel catalogo. */
export async function scollegaTlMateriaAction(
  nomeSchema: string,
  materiaId: number,
  tlId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(materiaId) || materiaId <= 0 || !Number.isInteger(tlId) || tlId <= 0)
      return { success: false, error: 'Materia o TS non valida.' };
    await assicuraTabelleTl(nomeSchema);
    await pool.query(
      `DELETE FROM "${nomeSchema}".materia_tl WHERE materia_id = $1 AND tl_id = $2`,
      [materiaId, tlId]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[scollegaTlMateriaAction]', error);
    return {
      success: false,
      error: `Rimozione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/**
 * RIPORTA UN UFFICIO FUORI ELENCO A UNA DIRETTRICE (0.139.1).
 *
 * Un ufficio che non è tra le direttrici ha un nome che vale solo per sé: le
 * sue posizioni finiscono in un documento a parte, e nessuno se ne accorge
 * finché non arriva in fondo alla catena. Qui si sposta il nome — nelle
 * associazioni delle materie e nei titoli che lo dichiarano — sulla direttrice
 * indicata, con la grafia scritta nei Parametri. È un comando solo perché
 * toccare trenta righe a mano è il modo in cui l'ufficio si risdoppia.
 *
 * Le due scritture stanno in una transazione: o si sposta tutto, o niente.
 */
export async function riallineaUfficioAllaDirettriceAction(
  nomeSchema: string,
  da: string,
  a: string
): Promise<{
  success: boolean;
  destinazione?: string;
  lavorazioni?: number;
  codici?: number;
  error?: string;
}> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleTl(nomeSchema);
    // I titoli vivono in una tabella che potrebbe non essere ancora nata in uno
    // spazio nuovo: la crea la stessa funzione che usa la pagina dei titoli.
    await assicuraTabelleParametriSpazio(nomeSchema);

    const direttrici = await direttriciDelloSpazio(nomeSchema);
    const lavorazioni = await pool.query(`SELECT id, dipendenza FROM "${nomeSchema}".materia_tl`);
    const titoli = await pool.query(`SELECT id, dipendenza FROM "${nomeSchema}".titoli_ente`);

    const pianificato = pianificaRiallineamento({
      da,
      a,
      direttrici,
      lavorazioni: lavorazioni.rows.map((r) => ({
        id: Number(r.id),
        dipendenza: (r.dipendenza as string | null) ?? null,
      })),
      titoli: titoli.rows.map((r) => ({
        id: Number(r.id),
        dipendenza: (r.dipendenza as string | null) ?? null,
      })),
    });
    if (!pianificato.ok) return { success: false, error: pianificato.error };
    const { piano } = pianificato;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (piano.lavorazioni.length > 0)
        await client.query(
          `UPDATE "${nomeSchema}".materia_tl
              SET dipendenza = $2
            WHERE id = ANY($1::int[])`,
          [piano.lavorazioni, piano.destinazione]
        );
      if (piano.codici.length > 0)
        await client.query(
          `UPDATE "${nomeSchema}".titoli_ente
              SET dipendenza = $2, aggiornato_il = now()
            WHERE id = ANY($1::int[])`,
          [piano.codici, piano.destinazione]
        );
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    return {
      success: true,
      destinazione: piano.destinazione,
      lavorazioni: piano.lavorazioni.length,
      codici: piano.codici.length,
    };
  } catch (error: unknown) {
    console.error('[riallineaUfficioAllaDirettriceAction]', error);
    return {
      success: false,
      error: `Riallineamento non riuscito: ${(error as Error).message || error}`,
    };
  }
}
