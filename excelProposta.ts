'use server';

// Etichette dell'Anagrafica Ente — configurabili a livello di spazio,
// perché ogni ente chiama le proprie posizioni/codici a modo suo (INPS:
// matricola, posizione gestione separata, codici CSC/CA...). Fino a 10
// campi testo liberi, ciascuno con etichetta personalizzabile E flag di
// attivazione — flessibilità massima, stesso principio della Check List
// custom: un ente diffidente verso uno strumento che sembra rigido lo
// respinge prima ancora di provarlo. Solo i campi attivi compaiono nel
// form e nel modello esportato. I valori si compilano per scenario (vedi
// anagraficaEnte.ts).

import { pool } from '@/lib/db';
import { assicuraTabelleAnagraficaEnte } from '@/db/provision';

const NUMERO_CAMPI = 10;
const ETICHETTE_DEFAULT = Array.from({ length: NUMERO_CAMPI }, (_, i) => `Campo ${i + 1}`);
/** Solo i primi 5 attivi di default — coerente con lo storico (5 campi), il resto è a disposizione se un ente vuole tracciare più cose. */
const ATTIVO_DEFAULT = (campo: number) => campo <= 5;

export interface EtichettaAnagraficaEnte {
  campo: number; // 1..10
  etichetta: string;
  attivo: boolean;
}

export interface RisultatoEtichetteAnagraficaEnte {
  success: boolean;
  etichette: EtichettaAnagraficaEnte[];
  error?: string;
}

export async function ottieniEtichetteAnagraficaEnte(
  nomeSchema: string
): Promise<RisultatoEtichetteAnagraficaEnte> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, etichette: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabelleAnagraficaEnte(nomeSchema);

    const esistenti = await pool.query(
      `SELECT campo, etichetta, attivo FROM "${nomeSchema}".anagrafica_ente_config ORDER BY campo`
    );
    const mappa = new Map(esistenti.rows.map((r) => [r.campo as number, r]));

    if (mappa.size === 0) {
      for (let i = 0; i < NUMERO_CAMPI; i++) {
        await pool.query(
          `INSERT INTO "${nomeSchema}".anagrafica_ente_config (campo, etichetta, attivo) VALUES ($1, $2, $3)
           ON CONFLICT (campo) DO NOTHING`,
          [i + 1, ETICHETTE_DEFAULT[i], ATTIVO_DEFAULT(i + 1)]
        );
      }
      return {
        success: true,
        etichette: ETICHETTE_DEFAULT.map((etichetta, i) => ({
          campo: i + 1,
          etichetta,
          attivo: ATTIVO_DEFAULT(i + 1),
        })),
      };
    }

    return {
      success: true,
      etichette: Array.from({ length: NUMERO_CAMPI }, (_, i) => {
        const campo = i + 1;
        const riga = mappa.get(campo);
        return {
          campo,
          etichetta: riga?.etichetta || ETICHETTE_DEFAULT[i],
          attivo: riga?.attivo ?? ATTIVO_DEFAULT(campo),
        };
      }),
    };
  } catch (error: any) {
    console.error('[ottieniEtichetteAnagraficaEnte] Errore:', error);
    return {
      success: false,
      etichette: [],
      error: `Impossibile caricare le etichette: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneEtichetta {
  success: boolean;
  error?: string;
}

export async function aggiornaEtichettaAnagraficaEnteAction(
  nomeSchema: string,
  campo: number,
  dati: { etichetta?: string; attivo?: boolean }
): Promise<RisultatoOperazioneEtichetta> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    if (campo < 1 || campo > NUMERO_CAMPI) return { success: false, error: 'Campo non valido.' };

    await assicuraTabelleAnagraficaEnte(nomeSchema);
    const campiAggiornati: string[] = [];
    const valori: (string | boolean)[] = [String(campo)];
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
      `UPDATE "${nomeSchema}".anagrafica_ente_config SET ${campiAggiornati.join(', ')} WHERE campo = $1`,
      valori
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".anagrafica_ente_config (campo, etichetta, attivo) VALUES ($1, $2, $3)`,
        [campo, dati.etichetta?.trim() || ETICHETTE_DEFAULT[campo - 1], dati.attivo ?? true]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaEtichettaAnagraficaEnteAction] Errore:', error);
    return { success: false, error: `Impossibile salvare l'etichetta: ${error.message || error}` };
  }
}
