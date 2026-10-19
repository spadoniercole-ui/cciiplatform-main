'use server';

// LAVORAZIONI PER TIPOLOGIA DI DEBITO — configurazione dello spazio.
//
// Per ogni categoria di debito (le stesse `categorie_tipo_debito`) si dice
// che lavorazione va svolta e a quale collega va chiesta. È il dato che
// rende pertinenti le comunicazioni preparate dal triage: senza una
// lavorazione configurata la piattaforma non inventa un destinatario né un
// compito.
//
// Le letture sono accessibili a chi ha accesso allo schema; le scritture
// solo all'Admin di spazio, come le altre configurazioni.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import {
  assicuraTabellaCategorieTipoDebito,
  assicuraTabellaLavorazioniTipoDebito,
} from '@/db/provision';
import { TIPI_DEBITO_ENTE } from '@/lib/debitiEnte/tipoDebito';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface LavorazioneTipoDebito {
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

export async function ottieniLavorazioniTipoDebito(
  nomeSchema: string
): Promise<RisultatoLavorazioni> {
  try {
    await richiediAccessoSchema(nomeSchema);
    if (!validaSchema(nomeSchema)) {
      return { success: false, lavorazioni: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaLavorazioniTipoDebito(nomeSchema);
    const r = await pool.query(
      `SELECT id, categoria, lavorazione, destinatario, attivo, ordine
       FROM "${nomeSchema}".lavorazioni_tipo_debito
       ORDER BY ordine ASC, id ASC`
    );
    return {
      success: true,
      lavorazioni: r.rows.map((x) => ({
        id: Number(x.id),
        categoria: String(x.categoria),
        lavorazione: String(x.lavorazione),
        destinatario: String(x.destinatario),
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

export interface InputLavorazioneTipoDebito {
  id?: number | null;
  categoria: string;
  lavorazione: string;
  destinatario: string;
  attivo: boolean;
}

export interface RisultatoOperazioneLavorazione {
  success: boolean;
  id?: number;
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

export async function salvaLavorazioneTipoDebitoAction(
  nomeSchema: string,
  input: InputLavorazioneTipoDebito
): Promise<RisultatoOperazioneLavorazione> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };

    const categoria = (input.categoria || '').trim();
    const lavorazione = (input.lavorazione || '').trim();
    const destinatario = (input.destinatario || '').trim();

    if (!categoria) return { success: false, error: 'Scegli la tipologia di debito.' };
    if (!lavorazione) return { success: false, error: 'Indica la lavorazione da svolgere.' };
    if (!destinatario)
      return { success: false, error: 'Indica il collega a cui inviare la comunicazione.' };
    if (lavorazione.length > 500) {
      return { success: false, error: 'La lavorazione non può superare 500 caratteri.' };
    }
    if (destinatario.length > 160) {
      return { success: false, error: 'Il destinatario non può superare 160 caratteri.' };
    }

    await assicuraTabellaLavorazioniTipoDebito(nomeSchema);
    if (!(await categoriaEsiste(nomeSchema, categoria))) {
      return { success: false, error: 'Tipologia di debito non riconosciuta.' };
    }

    const attivo = input.attivo !== false;
    const id = input.id == null ? null : Number(input.id);
    if (id !== null) {
      if (!Number.isInteger(id) || id <= 0) {
        return { success: false, error: 'Lavorazione non valida.' };
      }
      const r = await pool.query(
        `UPDATE "${nomeSchema}".lavorazioni_tipo_debito
         SET categoria = $2, lavorazione = $3, destinatario = $4, attivo = $5
         WHERE id = $1
         RETURNING id`,
        [id, categoria, lavorazione, destinatario, attivo]
      );
      if ((r.rowCount ?? 0) === 0) return { success: false, error: 'Lavorazione non trovata.' };
      return { success: true, id };
    }

    const ordine = await pool.query(
      `SELECT COALESCE(MAX(ordine), 0) + 1 AS n FROM "${nomeSchema}".lavorazioni_tipo_debito`
    );
    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".lavorazioni_tipo_debito
         (categoria, lavorazione, destinatario, attivo, ordine)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [categoria, lavorazione, destinatario, attivo, Number(ordine.rows[0]?.n ?? 1)]
    );
    return { success: true, id: Number(r.rows[0].id) };
  } catch (error: any) {
    if (error?.code === '23505') {
      return {
        success: false,
        error: 'Esiste già una lavorazione con questo nome per la stessa tipologia di debito.',
      };
    }
    console.error('[salvaLavorazioneTipoDebitoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare la lavorazione: ${error.message || error}`,
    };
  }
}

export async function eliminaLavorazioneTipoDebitoAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneLavorazione> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, error: 'Lavorazione non valida.' };
    }
    await assicuraTabellaLavorazioniTipoDebito(nomeSchema);
    const r = await pool.query(
      `DELETE FROM "${nomeSchema}".lavorazioni_tipo_debito WHERE id = $1 RETURNING id`,
      [id]
    );
    if ((r.rowCount ?? 0) === 0) return { success: false, error: 'Lavorazione non trovata.' };
    return { success: true, id };
  } catch (error: any) {
    console.error('[eliminaLavorazioneTipoDebitoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare la lavorazione: ${error.message || error}`,
    };
  }
}
