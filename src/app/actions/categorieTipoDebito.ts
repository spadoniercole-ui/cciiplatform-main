'use server';

// Categorie tipo debito PARAMETRICHE di spazio (default Debito/AVA/Neutro).
// Sono le scelte offerte per classificare i debiti dell'ente; l'insieme è
// modificabile. I codici legacy (CLE/CEN/CEC/CEA) NON stanno qui: restano
// risolvibili via fallback statico, così i dati già inseriti non si toccano.

import { pool } from '@/lib/db';
import { assicuraTabellaCategorieTipoDebito } from '@/db/provision';

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
}

export async function creaCategoriaTipoDebitoAction(
  nomeSchema: string,
  etichetta: string,
  descrizione?: string
): Promise<RisultatoOperazioneCategoria> {
  try {
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
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const et = etichetta.trim();
    if (!et) return { success: false, error: "L'etichetta è obbligatoria." };
    await assicuraTabellaCategorieTipoDebito(nomeSchema);
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

/** Imposta se la categoria contribuisce ai totali (false = neutra rispetto a debito e AVA). */
export async function impostaContribuisceCategoriaTipoDebitoAction(
  nomeSchema: string,
  codice: string,
  contribuisce: boolean
): Promise<RisultatoOperazioneCategoria> {
  try {
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
