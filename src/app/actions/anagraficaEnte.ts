'use server';

// Valori dell'Anagrafica Ente per un'azienda — ID ente più fino a 10
// campi liberi (le cui etichette E il flag di attivazione sono
// configurati a livello di spazio, vedi anagraficaEnteConfig.ts). Solo
// i campi attivi vengono mostrati/richiesti — quelli disattivati
// restano nel database se già compilati in passato, semplicemente non
// più mostrati.

import { pool } from '@/lib/db';
import { assicuraTabelleAnagraficaEnte } from '@/db/provision';
import { CHIAVI_CAMPO_ANAGRAFICA_ENTE } from '@/lib/costantiRicevibilita';

const NUMERO_CAMPI = 10;

export interface AnagraficaEnte {
  idEnte: string | null;
  campo1: string | null;
  campo2: string | null;
  campo3: string | null;
  campo4: string | null;
  campo5: string | null;
  campo6: string | null;
  campo7: string | null;
  campo8: string | null;
  campo9: string | null;
  campo10: string | null;
}

const VUOTA: AnagraficaEnte = {
  idEnte: null,
  campo1: null,
  campo2: null,
  campo3: null,
  campo4: null,
  campo5: null,
  campo6: null,
  campo7: null,
  campo8: null,
  campo9: null,
  campo10: null,
};

const CHIAVI_CAMPO = CHIAVI_CAMPO_ANAGRAFICA_ENTE as (keyof AnagraficaEnte)[];

export interface RisultatoAnagraficaEnte {
  success: boolean;
  dati: AnagraficaEnte;
  error?: string;
}

export async function ottieniAnagraficaEnte(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoAnagraficaEnte> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, dati: VUOTA, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleAnagraficaEnte(nomeSchema);

    const colonneCampo = Array.from({ length: NUMERO_CAMPI }, (_, i) => `campo_${i + 1}`).join(
      ', '
    );
    const risultato = await pool.query(
      `SELECT id_ente, ${colonneCampo} FROM "${nomeSchema}".anagrafica_ente WHERE azienda_id = $1`,
      [aziendaId]
    );
    if (risultato.rows.length === 0) {
      return { success: true, dati: VUOTA };
    }
    const r = risultato.rows[0];
    const dati: AnagraficaEnte = { ...VUOTA, idEnte: r.id_ente };
    for (let i = 1; i <= NUMERO_CAMPI; i++) {
      (dati as unknown as Record<string, string | null>)[`campo${i}`] = r[`campo_${i}`];
    }
    return { success: true, dati };
  } catch (error: any) {
    console.error('[ottieniAnagraficaEnte] Errore:', error);
    return {
      success: false,
      dati: VUOTA,
      error: `Impossibile caricare l'anagrafica: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneAnagraficaEnte {
  success: boolean;
  error?: string;
}

export async function salvaAnagraficaEnteAction(
  nomeSchema: string,
  aziendaId: number,
  dati: AnagraficaEnte
): Promise<RisultatoOperazioneAnagraficaEnte> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };

    const tuttiICampi = [dati.idEnte, ...CHIAVI_CAMPO.map((k) => dati[k])];
    if (!tuttiICampi.some((c) => c && c.trim())) {
      return { success: false, error: 'Compila almeno un campo prima di salvare.' };
    }

    await assicuraTabelleAnagraficaEnte(nomeSchema);

    const nomiColonne = ['azienda_id', 'id_ente', ...CHIAVI_CAMPO.map((_, i) => `campo_${i + 1}`)];
    const valori: (number | string | null)[] = [
      aziendaId,
      dati.idEnte,
      ...CHIAVI_CAMPO.map((k) => dati[k]),
    ];
    const placeholderUpdate = nomiColonne
      .slice(1)
      .map((col, i) => `${col} = $${i + 2}`)
      .join(', ');

    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".anagrafica_ente SET ${placeholderUpdate}, updated_at = now() WHERE azienda_id = $1`,
      valori
    );
    if (aggiornata.rowCount === 0) {
      const placeholderInsert = nomiColonne.map((_, i) => `$${i + 1}`).join(', ');
      await pool.query(
        `INSERT INTO "${nomeSchema}".anagrafica_ente (${nomiColonne.join(', ')}) VALUES (${placeholderInsert})`,
        valori
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[salvaAnagraficaEnteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare l'anagrafica: ${error.message || error}`,
    };
  }
}
