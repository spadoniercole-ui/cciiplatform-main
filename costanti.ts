'use server';

// Colonne dei modelli di Check List custom — flessibilità massima,
// deciso esplicitamente: un utente diffidente verso uno strumento che
// sembra rigido lo respinge prima ancora di provarlo. Tutti i 7 campi di
// base sono disattivabili E rietichettabili tranne "domanda" (il testo,
// senza il quale non c'è nulla da rispondere) — ciascuno con un
// comportamento di ripiego se disattivato:
//  - sezioneNumero/sezioneTitolo: le domande confluiscono in una sezione
//    unica generata automaticamente (si disattivano/riattivano insieme,
//    sono una coppia — una sezione senza titolo o senza numero non ha
//    senso).
//  - domandaId: generato in automatico in ordine (1, 2, 3...).
//  - peso: ogni domanda prende il "peso di default" impostato qui sotto.
//  - aCuraDi / nota: semplicemente non tracciati.
// Più fino a 3 campi extra propri, puramente informativi, per un totale
// di 10 assieme ai 7 di base.

import { pool } from '@/lib/db';
import { assicuraTabelleScenari } from '@/db/provision';
import type { PesoDomanda } from '@/lib/checklist/ministeriale';
import { ORDINE_CAMPI_BASE_CHECKLIST } from '@/lib/costantiRicevibilita';

export type CampoColonnaChecklist =
  'sezioneNumero' | 'sezioneTitolo' | 'domandaId' | 'domanda' | 'peso' | 'aCuraDi' | 'nota';

const ETICHETTE_DEFAULT: Record<CampoColonnaChecklist, string> = {
  sezioneNumero: 'Sezione N.',
  sezioneTitolo: 'Sezione Titolo',
  domandaId: 'ID',
  domanda: 'Domanda',
  peso: 'Peso',
  aCuraDi: 'A cura di',
  nota: 'Nota',
};

const CAMPI_SEMPRE_ATTIVI: CampoColonnaChecklist[] = ['domanda'];

export interface EtichettaColonnaChecklist {
  campo: CampoColonnaChecklist;
  etichetta: string;
  attivo: boolean;
}

export interface CampoExtraChecklist {
  id: number;
  etichetta: string;
  ordine: number;
}

export interface RisultatoColonneChecklist {
  success: boolean;
  colonne: EtichettaColonnaChecklist[];
  campiExtra: CampoExtraChecklist[];
  pesoDefault: PesoDomanda;
  error?: string;
}

export async function ottieniColonneChecklist(
  nomeSchema: string
): Promise<RisultatoColonneChecklist> {
  const vuoto = {
    success: false as const,
    colonne: [],
    campiExtra: [],
    pesoDefault: 'RILEVANTE' as PesoDomanda,
  };
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { ...vuoto, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleScenari(nomeSchema);

    const esistenti = await pool.query(
      `SELECT campo, etichetta, attivo, peso_default FROM "${nomeSchema}".checklist_colonne_config`
    );
    const mappa = new Map(esistenti.rows.map((r) => [r.campo as CampoColonnaChecklist, r]));

    let pesoDefault: PesoDomanda = 'RILEVANTE';
    const rigaPeso = mappa.get('peso');
    if (rigaPeso?.peso_default) pesoDefault = rigaPeso.peso_default as PesoDomanda;

    if (mappa.size === 0) {
      for (const campo of ORDINE_CAMPI_BASE_CHECKLIST) {
        await pool.query(
          `INSERT INTO "${nomeSchema}".checklist_colonne_config (campo, etichetta) VALUES ($1, $2)
           ON CONFLICT (campo) DO NOTHING`,
          [campo, ETICHETTE_DEFAULT[campo]]
        );
      }
    }

    const campiExtraRis = await pool.query(
      `SELECT id, etichetta, ordine FROM "${nomeSchema}".checklist_campi_extra ORDER BY ordine`
    );

    return {
      success: true,
      colonne: ORDINE_CAMPI_BASE_CHECKLIST.map((campo) => {
        const riga = mappa.get(campo);
        return {
          campo,
          etichetta: riga?.etichetta || ETICHETTE_DEFAULT[campo],
          attivo: CAMPI_SEMPRE_ATTIVI.includes(campo) ? true : (riga?.attivo ?? true),
        };
      }),
      campiExtra: campiExtraRis.rows.map((r) => ({
        id: r.id,
        etichetta: r.etichetta,
        ordine: r.ordine,
      })),
      pesoDefault,
    };
  } catch (error: any) {
    console.error('[ottieniColonneChecklist] Errore:', error);
    return { ...vuoto, error: `Impossibile caricare le colonne: ${error.message || error}` };
  }
}

export interface RisultatoOperazioneColonna {
  success: boolean;
  error?: string;
}

export async function aggiornaColonnaChecklistAction(
  nomeSchema: string,
  campo: CampoColonnaChecklist,
  dati: { etichetta?: string; attivo?: boolean }
): Promise<RisultatoOperazioneColonna> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    if (CAMPI_SEMPRE_ATTIVI.includes(campo) && dati.attivo === false) {
      return { success: false, error: '"Domanda" non può essere disattivata.' };
    }
    await assicuraTabelleScenari(nomeSchema);

    if (campo === 'sezioneNumero' || campo === 'sezioneTitolo') {
      for (const c of ['sezioneNumero', 'sezioneTitolo'] as const) {
        await pool.query(
          `INSERT INTO "${nomeSchema}".checklist_colonne_config (campo, etichetta, attivo) VALUES ($1, $2, $3)
           ON CONFLICT (campo) DO UPDATE SET attivo = $3`,
          [c, ETICHETTE_DEFAULT[c], dati.attivo ?? true]
        );
      }
      if (dati.etichetta) {
        await pool.query(
          `UPDATE "${nomeSchema}".checklist_colonne_config SET etichetta = $2 WHERE campo = $1`,
          [campo, dati.etichetta.trim()]
        );
      }
      return { success: true };
    }

    const campiAggiornati: string[] = [];
    const valori: (string | boolean)[] = [campo];
    if (dati.etichetta !== undefined) {
      if (!dati.etichetta.trim())
        return { success: false, error: "L'etichetta non può essere vuota." };
      campiAggiornati.push(`etichetta = $${valori.length + 1}`);
      valori.push(dati.etichetta.trim());
    }
    if (dati.attivo !== undefined) {
      campiAggiornati.push(`attivo = $${valori.length + 1}`);
      valori.push(dati.attivo);
    }
    if (campiAggiornati.length === 0) return { success: true };

    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".checklist_colonne_config SET ${campiAggiornati.join(', ')} WHERE campo = $1`,
      valori
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".checklist_colonne_config (campo, etichetta, attivo) VALUES ($1, $2, $3)`,
        [campo, dati.etichetta?.trim() || ETICHETTE_DEFAULT[campo], dati.attivo ?? true]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaColonnaChecklistAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

export async function aggiornaPesoDefaultChecklistAction(
  nomeSchema: string,
  pesoDefault: PesoDomanda
): Promise<RisultatoOperazioneColonna> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenari(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".checklist_colonne_config (campo, etichetta, peso_default) VALUES ('peso', $2, $1)
       ON CONFLICT (campo) DO UPDATE SET peso_default = $1`,
      [pesoDefault, ETICHETTE_DEFAULT.peso]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaPesoDefaultChecklistAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

const MASSIMO_CAMPI_EXTRA = 3;

export async function aggiungiCampoExtraChecklistAction(
  nomeSchema: string,
  etichetta: string
): Promise<RisultatoOperazioneColonna> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    if (!etichetta.trim()) return { success: false, error: "L'etichetta non può essere vuota." };
    await assicuraTabelleScenari(nomeSchema);
    const conteggio = await pool.query(
      `SELECT count(*) FROM "${nomeSchema}".checklist_campi_extra`
    );
    if (Number(conteggio.rows[0].count) >= MASSIMO_CAMPI_EXTRA) {
      return {
        success: false,
        error: `Massimo ${MASSIMO_CAMPI_EXTRA} campi extra (10 in totale con i 7 di base).`,
      };
    }
    await pool.query(
      `INSERT INTO "${nomeSchema}".checklist_campi_extra (etichetta, ordine) VALUES ($1, $2)`,
      [etichetta.trim(), Number(conteggio.rows[0].count)]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiungiCampoExtraChecklistAction] Errore:', error);
    return { success: false, error: `Impossibile aggiungere: ${error.message || error}` };
  }
}

export async function eliminaCampoExtraChecklistAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneColonna> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenari(nomeSchema);
    await pool.query(`DELETE FROM "${nomeSchema}".checklist_campi_extra WHERE id = $1`, [id]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaCampoExtraChecklistAction] Errore:', error);
    return { success: false, error: `Impossibile eliminare: ${error.message || error}` };
  }
}
