'use server';

// LAVORAZIONI PER TIPOLOGIA DI DEBITO — configurazione dello spazio.
//
// Fino alla 0.157.0 ogni categoria di debito aveva una riga scritta a mano con
// la lavorazione e il destinatario: la stessa procedura esisteva in due tabelle
// (questa e le lavorazioni delle materie) e andava tenuta allineata a mano.
//
// Dalla 0.159.0 la categoria **punta** a una TL del catalogo piatto (`tl`):
// codice, descrizione e contrassegno si scrivono una volta sola, nel catalogo,
// e qui si dice soltanto quale di quelle TL lavora ogni categoria di debito.
// L'ufficio che firma la comunicazione è quello dell'associazione della materia
// che usa la TL. La vecchia tabella `lavorazioni_tipo_debito` resta come
// storico: non si legge e non si scrive.
//
// Le letture sono accessibili a chi ha accesso allo schema; le scritture solo
// all'Admin di spazio, come le altre configurazioni.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabellaCategorieTipoDebito, assicuraTabelleTl } from '@/db/provision';
import { TIPI_DEBITO_ENTE } from '@/lib/debitiEnte/tipoDebito';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface LavorazioneTipoDebito {
  /** L'id della TL del catalogo: è la chiave del collegamento. */
  id: number;
  categoria: string;
  lavorazione: string;
  destinatario: string;
  attivo: boolean;
  ordine: number;
}

export interface RisultatoLavorazioni {
  success: boolean;
  lavorazioni: LavorazioneTipoDebito[];
  error?: string;
}

/**
 * Le TL che lavorano ogni categoria di debito.
 *
 * La forma non cambia rispetto a prima — `id`, `categoria`, `lavorazione`,
 * `destinatario`, `attivo`, `ordine` — perché la leggono il triage, le
 * comunicazioni e i documenti per reparto. Cambia la provenienza: i campi
 * arrivano dal catalogo, non da una tabella di configurazione parallela.
 */
export async function ottieniLavorazioniTipoDebito(
  nomeSchema: string
): Promise<RisultatoLavorazioni> {
  try {
    await richiediAccessoSchema(nomeSchema);
    if (!validaSchema(nomeSchema)) {
      return { success: false, lavorazioni: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabelleTl(nomeSchema);
    // La TL del catalogo non porta più l'ufficio: il destinatario è quello
    // dell'associazione della materia che la usa. Se più materie la usano con
    // uffici diversi, la categoria non può scegliere al posto loro: prende il
    // primo, e il documento dice comunque la TL.
    const r = await pool.query(
      `SELECT t.id, c.categoria, t.codice, t.descrizione,
              COALESCE(
                (SELECT a.dipendenza FROM "${nomeSchema}".materia_tl a
                  WHERE a.tl_id = t.id AND a.dipendenza IS NOT NULL
                    AND btrim(a.dipendenza) <> ''
                  ORDER BY a.ordine, a.id LIMIT 1),
                ''
              ) AS destinatario,
              c.attivo, c.ordine
         FROM "${nomeSchema}".categoria_tl c
         JOIN "${nomeSchema}".tl t ON t.id = c.tl_id
        ORDER BY c.categoria, c.ordine ASC, t.id ASC`
    );
    return {
      success: true,
      lavorazioni: r.rows.map((x) => ({
        id: Number(x.id),
        categoria: String(x.categoria),
        lavorazione:
          String(x.codice ?? '').trim() && String(x.descrizione ?? '').trim()
            ? `${String(x.codice).trim()} — ${String(x.descrizione).trim()}`
            : String(x.descrizione ?? x.codice ?? '').trim(),
        destinatario: String(x.destinatario ?? ''),
        attivo: x.attivo === true,
        ordine: Number(x.ordine ?? 0),
      })),
    };
  } catch (error: any) {
    console.error('[ottieniLavorazioniTipoDebito] Errore:', error);
    return {
      success: false,
      lavorazioni: [],
      error: `Impossibile caricare le lavorazioni: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneLavorazione {
  success: boolean;
  error?: string;
}

/** La categoria deve esistere davvero: niente tipologie inventate dal browser. */
async function categoriaEsiste(nomeSchema: string, categoria: string): Promise<boolean> {
  await assicuraTabellaCategorieTipoDebito(nomeSchema);
  const r = await pool.query(
    `SELECT 1 FROM "${nomeSchema}".categorie_tipo_debito WHERE codice = $1`,
    [categoria]
  );
  if ((r.rowCount ?? 0) > 0) return true;
  // I quattro codici legacy restano validi per i dati già inseriti.
  return TIPI_DEBITO_ENTE.some((t) => t.valore === categoria);
}

/**
 * Una categoria di debito lavora una TL del catalogo.
 *
 * Il collegamento non copia nulla: se domani l'ufficio cambia nome nella TL,
 * cambia per tutte le categorie che la usano. Una categoria può avere più TL
 * (due competenze distinte sulla stessa posizione), la stessa TL può servire
 * più categorie.
 */
export async function collegaCategoriaTlAction(
  nomeSchema: string,
  categoria: string,
  tlId: number
): Promise<RisultatoOperazioneLavorazione> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const cod = String(categoria ?? '').trim();
    if (!cod) return { success: false, error: 'Indica la categoria di debito.' };
    if (!Number.isInteger(tlId) || tlId <= 0) return { success: false, error: 'TL non valida.' };
    if (!(await categoriaEsiste(nomeSchema, cod)))
      return { success: false, error: `Categoria di debito «${cod}» non riconosciuta.` };

    await assicuraTabelleTl(nomeSchema);
    const tl = await pool.query(`SELECT 1 FROM "${nomeSchema}".tl WHERE id = $1`, [tlId]);
    if ((tl.rowCount ?? 0) === 0) return { success: false, error: 'TL non trovata nel catalogo.' };

    await pool.query(
      `INSERT INTO "${nomeSchema}".categoria_tl (categoria, tl_id, attivo, ordine)
       SELECT $1, $2, TRUE,
              COALESCE(
                (SELECT MAX(ordine) + 1 FROM "${nomeSchema}".categoria_tl WHERE categoria = $1),
                0
              )
       ON CONFLICT (categoria, tl_id) DO NOTHING`,
      [cod, tlId]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[collegaCategoriaTlAction] Errore:', error);
    return { success: false, error: `Collegamento non riuscito: ${error.message || error}` };
  }
}

/** La categoria smette di usare una TL. La TL resta nel catalogo. */
export async function scollegaCategoriaTlAction(
  nomeSchema: string,
  categoria: string,
  tlId: number
): Promise<RisultatoOperazioneLavorazione> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const cod = String(categoria ?? '').trim();
    if (!cod) return { success: false, error: 'Indica la categoria di debito.' };
    if (!Number.isInteger(tlId) || tlId <= 0) return { success: false, error: 'TL non valida.' };
    await assicuraTabelleTl(nomeSchema);
    const r = await pool.query(
      `DELETE FROM "${nomeSchema}".categoria_tl WHERE categoria = $1 AND tl_id = $2`,
      [cod, tlId]
    );
    if ((r.rowCount ?? 0) === 0) return { success: false, error: 'Collegamento non trovato.' };
    return { success: true };
  } catch (error: any) {
    console.error('[scollegaCategoriaTlAction] Errore:', error);
    return { success: false, error: `Rimozione non riuscita: ${error.message || error}` };
  }
}
