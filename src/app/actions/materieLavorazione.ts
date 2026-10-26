'use server';

// LAVORAZIONI DELLA MATERIA — configurazione dello spazio (0.138.0).
//
// La materia è la chiave dei titoli di credito: il titolo di una partita è
// quello della sua materia. Dipendenza (a chi si scrive) e procedura (come si
// incassa) sono quindi proprietà della materia, non del singolo codice, e si
// scrivono qui una volta; i titoli dell'ente le leggono da qui dove il codice
// non ha una sua versione.
//
// Perché una tabella e non le direttrici dello screening: le direttrici sono il
// questionario, questa è l'esecuzione. Aggiungere un campo di qualificazione
// alla lavorazione non deve toccare il questionario né i titoli.
//
// Ma i NOMI DEGLI UFFICI sono delle direttrici (0.139.0): la dipendenza si
// sceglie da lì, e questa azione salva la grafia scritta nei Parametri anche se
// il browser ne manda una diversa per maiuscole o accenti. Un ufficio, un nome,
// in ogni documento che lo nomina.
//
// Letture e scritture riservate all'Admin di spazio, come le altre voci dei
// Parametri: la pagina che le usa è già riservata, la guardia non si fida della
// pagina.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabellaMaterieLavorazione, assicuraTabelleParametriSpazio } from '@/db/provision';
import {
  normalizzaLavorazione,
  validaLavorazioneMateria,
  type InputLavorazioneMateria,
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
 * Le grafie degli uffici già configurati nello spazio, dalla più autorevole
 * alla più vecchia: prima le lavorazioni delle materie (la configurazione di
 * oggi), poi i titoli dei codici, infine la tabella per tipologia di debito
 * (congelata, ma i suoi destinatari sono ancora quelli che ricevono i
 * documenti).
 *
 * Serve a una cosa sola: chi scrive «ufficio contributi» dove esiste già
 * «Ufficio Contributi» salva la grafia che c'è. Lo stesso ufficio smette così
 * di dividersi in due documenti diversi.
 */
async function grafieDegliUffici(nomeSchema: string, escludiId: number | null): Promise<string[]> {
  // Ogni lettura è indipendente: una tabella che in questo spazio non esiste
  // (o non è ancora stata creata) non deve impedire il salvataggio.
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
      `SELECT DISTINCT dipendenza FROM "${nomeSchema}".materie_lavorazione
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

/**
 * Le direttrici dello spazio: sono loro a dare il nome all'ufficio. Se non si
 * leggono (spazio senza direttrici, tabella globale assente) si prosegue con
 * l'elenco vuoto — il salvataggio non deve dipendere da una configurazione che
 * può ancora mancare.
 */
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

function daRiga(r: Record<string, unknown>): LavorazioneMateria {
  return {
    id: Number(r.id),
    materiaId: Number(r.materia_id),
    tipologia: String(r.tipologia ?? ''),
    dipendenza: (r.dipendenza as string | null) ?? null,
    procedura: (r.procedura as string | null) ?? null,
    esito: (r.esito as string | null) ?? null,
    ordine: Number(r.ordine ?? 0),
  };
}

export async function ottieniLavorazioniMateria(
  nomeSchema: string
): Promise<{ success: boolean; lavorazioni: LavorazioneMateria[]; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema))
      return { success: false, lavorazioni: [], error: 'Nome schema non valido.' };
    await assicuraTabellaMaterieLavorazione(nomeSchema);
    const r = await pool.query(
      `SELECT id, materia_id, tipologia, dipendenza, procedura, esito, ordine
         FROM "${nomeSchema}".materie_lavorazione
        ORDER BY materia_id, ordine ASC, id ASC`
    );
    return { success: true, lavorazioni: r.rows.map(daRiga) };
  } catch (error: unknown) {
    console.error('[ottieniLavorazioniMateria]', error);
    return {
      success: false,
      lavorazioni: [],
      error: `Impossibile leggere le lavorazioni delle materie: ${(error as Error).message || error}`,
    };
  }
}

export async function salvaLavorazioneMateriaAction(
  nomeSchema: string,
  input: InputLavorazioneMateria
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaLavorazioneMateria(input);
    if (errore) return { success: false, error: errore };
    const dato = normalizzaLavorazione(input);

    await assicuraTabellaMaterieLavorazione(nomeSchema);
    // La materia deve esistere davvero: niente id inventati dal browser.
    const materia = await pool.query(`SELECT 1 FROM "${nomeSchema}".materie_ente WHERE id = $1`, [
      dato.materiaId,
    ]);
    if ((materia.rowCount ?? 0) === 0)
      return { success: false, error: 'Materia non riconosciuta.' };

    // L'ufficio ha un nome solo. Prima si cerca tra le direttrici (la fonte),
    // poi tra le grafie già in uso: si evita che lo stesso ufficio si sdoppi.
    // Non si uniscono uffici diversi, si sceglie la grafia che esiste.
    if (dato.dipendenza) {
      const direttrici = await direttriciDelloSpazio(nomeSchema);
      const registro = registroDipendenze(await grafieDegliUffici(nomeSchema, dato.id ?? null));
      dato.dipendenza =
        direttriceConfigurata(dato.dipendenza, direttrici) ??
        grafiaGiaUsata(dato.dipendenza, registro) ??
        dato.dipendenza;
    }

    if (dato.id != null) {
      if (!Number.isInteger(dato.id) || dato.id <= 0)
        return { success: false, error: 'Lavorazione non valida.' };
      const r = await pool.query(
        `UPDATE "${nomeSchema}".materie_lavorazione
            SET materia_id = $2, tipologia = $3, dipendenza = $4, procedura = $5,
                esito = $6, aggiornato_il = now()
          WHERE id = $1
          RETURNING id`,
        [dato.id, dato.materiaId, dato.tipologia, dato.dipendenza, dato.procedura, dato.esito]
      );
      if ((r.rowCount ?? 0) === 0) return { success: false, error: 'Lavorazione non trovata.' };
      return { success: true, id: dato.id };
    }

    // L'ordine è per materia: si eseguono una dopo l'altra, la prima è quella
    // che il titolo eredita.
    const ordine = await pool.query(
      `SELECT COALESCE(MAX(ordine), 0) + 1 AS n
         FROM "${nomeSchema}".materie_lavorazione WHERE materia_id = $1`,
      [dato.materiaId]
    );
    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".materie_lavorazione
         (materia_id, tipologia, dipendenza, procedura, esito, ordine)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        dato.materiaId,
        dato.tipologia,
        dato.dipendenza,
        dato.procedura,
        dato.esito,
        Number(ordine.rows[0]?.n ?? 1),
      ]
    );
    return { success: true, id: Number(r.rows[0].id) };
  } catch (error: unknown) {
    console.error('[salvaLavorazioneMateriaAction]', error);
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

/**
 * RIPORTA UN UFFICIO FUORI ELENCO A UNA DIRETTRICE (0.139.1).
 *
 * Un ufficio che non è tra le direttrici ha un nome che vale solo per sé: le
 * sue posizioni finiscono in un documento a parte, e nessuno se ne accorge
 * finché non arriva in fondo alla catena. Qui si sposta il nome — nelle
 * lavorazioni che lo scelgono e nei titoli che lo dichiarano — sulla direttrice
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
    await assicuraTabellaMaterieLavorazione(nomeSchema);
    // I titoli vivono in una tabella che potrebbe non essere ancora nata in uno
    // spazio nuovo: la crea la stessa funzione che usa la pagina dei titoli.
    await assicuraTabelleParametriSpazio(nomeSchema);

    const direttrici = await direttriciDelloSpazio(nomeSchema);
    const lavorazioni = await pool.query(
      `SELECT id, dipendenza FROM "${nomeSchema}".materie_lavorazione`
    );
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
          `UPDATE "${nomeSchema}".materie_lavorazione
              SET dipendenza = $2, aggiornato_il = now()
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

export async function eliminaLavorazioneMateriaAction(
  nomeSchema: string,
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(id) || id <= 0)
      return { success: false, error: 'Lavorazione non valida.' };
    await assicuraTabellaMaterieLavorazione(nomeSchema);
    const r = await pool.query(
      `DELETE FROM "${nomeSchema}".materie_lavorazione WHERE id = $1 RETURNING id`,
      [id]
    );
    if ((r.rowCount ?? 0) === 0) return { success: false, error: 'Lavorazione non trovata.' };
    return { success: true };
  } catch (error: unknown) {
    console.error('[eliminaLavorazioneMateriaAction]', error);
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}
