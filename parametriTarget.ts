'use server';

// Etichette dei 4 codici di tipo debito (CLE/CEN/CEC/CEA) — configurabili
// a livello di spazio, perché un ente può usare una propria nomenclatura
// interna per lo stesso concetto (es. CEA chiamato con un proprio codice
// interno). Il codice fisso (CLE/CEN/CEC/CEA) resta sempre quello, salvato
// nel database e usato dal calcolo — solo l'etichetta mostrata cambia.
// Stesso principio già usato per l'Anagrafica Ente.

import { pool } from '@/lib/db';
import { assicuraTabellaTipoDebitoConfig } from '@/db/provision';
import { TIPI_DEBITO_ENTE, type TipoDebitoEnte } from '@/lib/debitiEnte/tipoDebito';

export interface EtichettaTipoDebito {
  codice: TipoDebitoEnte;
  etichetta: string;
  descrizione: string;
}

export interface RisultatoEtichetteTipoDebito {
  success: boolean;
  etichette: EtichettaTipoDebito[];
  error?: string;
}

export async function ottieniEtichetteTipoDebito(
  nomeSchema: string
): Promise<RisultatoEtichetteTipoDebito> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, etichette: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaTipoDebitoConfig(nomeSchema);

    const esistenti = await pool.query(
      `SELECT codice, etichetta FROM "${nomeSchema}".tipo_debito_config`
    );
    if (esistenti.rows.length === 0) {
      for (const t of TIPI_DEBITO_ENTE) {
        await pool.query(
          `INSERT INTO "${nomeSchema}".tipo_debito_config (codice, etichetta) VALUES ($1, $2)
           ON CONFLICT (codice) DO NOTHING`,
          [t.valore, t.etichetta]
        );
      }
      return {
        success: true,
        etichette: TIPI_DEBITO_ENTE.map((t) => ({
          codice: t.valore,
          etichetta: t.etichetta,
          descrizione: t.descrizione,
        })),
      };
    }

    const mappa = new Map(esistenti.rows.map((r) => [r.codice, r.etichetta]));
    return {
      success: true,
      etichette: TIPI_DEBITO_ENTE.map((t) => ({
        codice: t.valore,
        etichetta: mappa.get(t.valore) || t.etichetta,
        descrizione: t.descrizione,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniEtichetteTipoDebito] Errore:', error);
    return {
      success: false,
      etichette: [],
      error: `Impossibile caricare le etichette: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneTipoDebito {
  success: boolean;
  error?: string;
}

export async function aggiornaEtichettaTipoDebitoAction(
  nomeSchema: string,
  codice: TipoDebitoEnte,
  etichetta: string
): Promise<RisultatoOperazioneTipoDebito> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    const testo = (etichetta || '').trim();
    if (!testo) {
      return { success: false, error: "L'etichetta non può essere vuota." };
    }
    await assicuraTabellaTipoDebitoConfig(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".tipo_debito_config (codice, etichetta) VALUES ($1, $2)
       ON CONFLICT (codice) DO UPDATE SET etichetta = $2`,
      [codice, testo]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaEtichettaTipoDebitoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare l'etichetta: ${error.message || error}`,
    };
  }
}
