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
// Letture e scritture riservate all'Admin di spazio, come le altre voci dei
// Parametri: la pagina che le usa è già riservata, la guardia non si fida della
// pagina.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabellaMaterieLavorazione } from '@/db/provision';
import {
  normalizzaLavorazione,
  validaLavorazioneMateria,
  type InputLavorazioneMateria,
  type LavorazioneMateria,
} from '@/lib/titoliEnte/lavorazioniMateria';
import { grafiaGiaUsata, registroDipendenze } from '@/lib/lavorazioni/dipendenze';

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

    // L'ufficio ha un nome solo: se la grafia scritta è già in uso altrove con
    // maiuscole o spazi diversi, si salva quella. Non si uniscono uffici
    // diversi — si evita solo che lo stesso si sdoppi.
    if (dato.dipendenza) {
      const registro = registroDipendenze(await grafieDegliUffici(nomeSchema, dato.id ?? null));
      dato.dipendenza = grafiaGiaUsata(dato.dipendenza, registro) ?? dato.dipendenza;
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
