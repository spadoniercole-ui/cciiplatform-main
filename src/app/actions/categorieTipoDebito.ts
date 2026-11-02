'use server';

// Categorie tipo debito PARAMETRICHE di spazio (default Debito/AVA/Neutro).
// Sono le scelte offerte per classificare i debiti dell'ente; l'insieme è
// modificabile. I codici legacy (CLE/CEN/CEC/CEA) NON stanno qui: restano
// risolvibili via fallback statico, così i dati già inseriti non si toccano.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabellaCategorieTipoDebito } from '@/db/provision';
import {
  assicuraCatalogoTl,
  segnaRigheStoricheDellaCategoria,
  type Esecutore,
} from '@/lib/migrazioni/catalogoTlDb';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface CategoriaTipoDebito {
  codice: string;
  etichetta: string;
  descrizione: string | null;
  ordine: number;
  attivo: boolean;
  /** Se false, la categoria è neutra: non alimenta i totali né i delta del confronto. */
  contribuisce: boolean;
}

export interface RisultatoCategorie {
  success: boolean;
  categorie: CategoriaTipoDebito[];
  error?: string;
}

/** Deriva un codice stabile e valido (A-Z0-9_) da un'etichetta. */
function codiceDaEtichetta(etichetta: string): string {
  const base = etichetta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return base || 'CAT';
}

export async function ottieniCategorieTipoDebito(nomeSchema: string): Promise<RisultatoCategorie> {
  try {
    await richiediAccessoSchema(nomeSchema);
    if (!validaSchema(nomeSchema)) {
      return { success: false, categorie: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaCategorieTipoDebito(nomeSchema);
    const r = await pool.query(
      `SELECT codice, etichetta, descrizione, ordine, attivo, contribuisce
       FROM "${nomeSchema}".categorie_tipo_debito ORDER BY ordine ASC, codice ASC`
    );
    return {
      success: true,
      categorie: r.rows.map((x) => ({
        codice: x.codice,
        etichetta: x.etichetta,
        descrizione: x.descrizione,
        ordine: x.ordine,
        attivo: x.attivo === true,
        contribuisce: x.contribuisce !== false,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniCategorieTipoDebito] Errore:', error);
    return {
      success: false,
      categorie: [],
      error: `Impossibile caricare le categorie: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneCategoria {
  success: boolean;
  codice?: string;
  error?: string;
  /** TL rimosse dal catalogo insieme alla categoria (solo nell'eliminazione). */
  collegamentiRimossi?: number;
}

/** L'esecutore del catalogo sul pool dell'applicazione. */
const eseguiSulPool: Esecutore = async (sql, parametri) => {
  const r = await pool.query(sql, parametri);
  return r.rows as Record<string, unknown>[];
};

export async function creaCategoriaTipoDebitoAction(
  nomeSchema: string,
  etichetta: string,
  descrizione?: string
): Promise<RisultatoOperazioneCategoria> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const et = etichetta.trim();
    if (!et) return { success: false, error: "L'etichetta è obbligatoria." };
    await assicuraTabellaCategorieTipoDebito(nomeSchema);
    // Codice univoco: parte dall'etichetta, aggiunge un suffisso se collide.
    let codice = codiceDaEtichetta(et);
    const esistenti = await pool.query(`SELECT codice FROM "${nomeSchema}".categorie_tipo_debito`);
    const usati = new Set(esistenti.rows.map((r) => r.codice));
    if (usati.has(codice)) {
      let i = 2;
      while (usati.has(`${codice}_${i}`)) i++;
      codice = `${codice}_${i}`;
    }
    const maxOrd = await pool.query(
      `SELECT COALESCE(MAX(ordine), 0) AS m FROM "${nomeSchema}".categorie_tipo_debito`
    );
    const ordine = (maxOrd.rows[0]?.m ?? 0) + 1;
    await pool.query(
      `INSERT INTO "${nomeSchema}".categorie_tipo_debito (codice, etichetta, descrizione, ordine, attivo)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [codice, et, descrizione?.trim() || null, ordine]
    );
    return { success: true, codice };
  } catch (error: any) {
    console.error('[creaCategoriaTipoDebitoAction] Errore:', error);
    return { success: false, error: `Impossibile creare la categoria: ${error.message || error}` };
  }
}

export async function aggiornaCategoriaTipoDebitoAction(
  nomeSchema: string,
  codice: string,
  etichetta: string,
  descrizione?: string
): Promise<RisultatoOperazioneCategoria> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const et = etichetta.trim();
    if (!et) return { success: false, error: "L'etichetta è obbligatoria." };
    await assicuraTabellaCategorieTipoDebito(nomeSchema);
    // IL NOME CAMBIA, IL COLLEGAMENTO NO (0.156.0). Le TL del catalogo sono
    // legate alla categoria per CODICE, non per etichetta: rinominare una
    // categoria non lascia nulla di orfano, e la schermata mostra sempre
    // l'etichetta corrente perché la legge dall'elenco delle categorie. È per
    // questo che qui non c'è nessuna riga da riscrivere nel catalogo — e non
    // perché il caso sia stato dimenticato.
    await pool.query(
      `UPDATE "${nomeSchema}".categorie_tipo_debito SET etichetta = $2, descrizione = $3 WHERE codice = $1`,
      [codice, et, descrizione?.trim() || null]
    );
    return { success: true, codice };
  } catch (error: any) {
    console.error('[aggiornaCategoriaTipoDebitoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare la categoria: ${error.message || error}`,
    };
  }
}

export async function impostaAttivoCategoriaTipoDebitoAction(
  nomeSchema: string,
  codice: string,
  attivo: boolean
): Promise<RisultatoOperazioneCategoria> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaCategorieTipoDebito(nomeSchema);
    await pool.query(
      `UPDATE "${nomeSchema}".categorie_tipo_debito SET attivo = $2 WHERE codice = $1`,
      [codice, attivo]
    );
    return { success: true, codice };
  } catch (error: any) {
    console.error('[impostaAttivoCategoriaTipoDebitoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare la categoria: ${error.message || error}`,
    };
  }
}

/**
 * ELIMINA UNA CATEGORIA E I SUOI COLLEGAMENTI NEL CATALOGO DELLE TL (0.156.0).
 *
 * Perché non basta cancellare la riga delle categorie. Le TL del catalogo e le
 * righe storiche non ancora migrate nominano la categoria per codice: tolta la
 * categoria, restano lì a indicare un ufficio per un tipo di debito che non
 * esiste più. Nessuno se ne accorge finché non guarda la configurazione, e
 * intanto quelle voci continuano a pesare sul triage.
 *
 * Le tre scritture stanno in una transazione: o la categoria sparisce con i
 * suoi collegamenti, o resta tutto com'era. Le righe storiche non si
 * cancellano — sono l'archivio della configurazione precedente — ma si segnano
 * come già migrate, così la migrazione non le riporta in vita al prossimo
 * caricamento del triage.
 */
export async function eliminaCategoriaTipoDebitoAction(
  nomeSchema: string,
  codice: string
): Promise<RisultatoOperazioneCategoria> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const pulito = (codice || '').trim();
    if (!pulito) return { success: false, error: 'Categoria non valida.' };

    await assicuraTabellaCategorieTipoDebito(nomeSchema);
    await assicuraCatalogoTl(eseguiSulPool, nomeSchema);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const categoria = await client.query(
        `DELETE FROM "${nomeSchema}".categorie_tipo_debito WHERE codice = $1 RETURNING codice`,
        [pulito]
      );
      if ((categoria.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Categoria non trovata.' };
      }
      const tl = await client.query(
        `DELETE FROM "${nomeSchema}".catalogo_tl WHERE codice = $1 RETURNING id`,
        [pulito]
      );
      const eseguiClient: Esecutore = async (sql, parametri) =>
        (await client.query(sql, parametri)).rows as Record<string, unknown>[];
      await segnaRigheStoricheDellaCategoria(eseguiClient, nomeSchema, pulito);
      await client.query('COMMIT');
      return { success: true, codice: pulito, collegamentiRimossi: tl.rowCount ?? 0 };
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[eliminaCategoriaTipoDebitoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare la categoria: ${error.message || error}`,
    };
  }
}

/** Imposta se la categoria contribuisce ai totali (false = neutra rispetto a debito e AVA). */
export async function impostaContribuisceCategoriaTipoDebitoAction(
  nomeSchema: string,
  codice: string,
  contribuisce: boolean
): Promise<RisultatoOperazioneCategoria> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaCategorieTipoDebito(nomeSchema);
    await pool.query(
      `UPDATE "${nomeSchema}".categorie_tipo_debito SET contribuisce = $2 WHERE codice = $1`,
      [codice, contribuisce]
    );
    return { success: true, codice };
  } catch (error: any) {
    console.error('[impostaContribuisceCategoriaTipoDebitoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare la categoria: ${error.message || error}`,
    };
  }
}
