// Lettura e scrittura dei parametri della simulazione del piano.
//
// Sta nella lib, non in un file 'use server': la leggono anche la simulazione
// (piano di sviluppo, confronto con il settore) e le due azioni della pagina
// Parametri. Il database conserva NULL quando lo spazio non ha deciso nulla, e
// NULL vale il predefinito di sistema — così una riga assente e una riga vuota
// dicono la stessa cosa, e la piattaforma non scrive numeri che nessuno ha
// scelto.

import { pool } from '@/lib/db';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import {
  parametriSimulazioneValidi,
  type ParametriSimulazionePiano,
} from '@/lib/piano/parametriSimulazione';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface LetturaParametriSimulazione {
  parametri: ParametriSimulazionePiano;
  /** true se lo spazio ha almeno un valore proprio (non tutti predefiniti). */
  personalizzati: boolean;
}

export async function leggiParametriSimulazione(
  nomeSchema: string
): Promise<LetturaParametriSimulazione> {
  if (!schemaOk(nomeSchema))
    return { parametri: parametriSimulazioneValidi(null), personalizzati: false };
  // Nessun DDL sul percorso di lettura: la simulazione del piano legge questi
  // parametri a ogni apertura, e la tabella la crea chi salva (o il bootstrap
  // dello spazio). Se la tabella non c'è ancora, valgono i valori di sistema.
  const r = await pool
    .query(
      `SELECT aliquota_imposte_default, variazione_massima_pct, limite_tasso_crescita, orizzonte_default,
              intensita_minima_attenzione
       FROM "${nomeSchema}".parametri_piano_simulazione WHERE id = 1`
    )
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const riga = (r.rows[0] ?? {}) as Record<string, unknown>;
  const parametri = parametriSimulazioneValidi({
    aliquotaImposteDefault: riga.aliquota_imposte_default,
    variazioneMassimaPct: riga.variazione_massima_pct,
    limiteTassoCrescita: riga.limite_tasso_crescita,
    orizzonteDefault: riga.orizzonte_default,
    intensitaMinimaAttenzione: riga.intensita_minima_attenzione,
  });
  const personalizzati = Object.values(riga).some((v) => v !== null && v !== undefined);
  return { parametri, personalizzati };
}

/** `null` riporta tutti i campi al predefinito di sistema. */
export async function scriviParametriSimulazione(
  nomeSchema: string,
  parametri: ParametriSimulazionePiano | null
): Promise<void> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');
  await assicuraTabelleParametriSpazio(nomeSchema);
  await pool.query(
    `INSERT INTO "${nomeSchema}".parametri_piano_simulazione
       (id, aliquota_imposte_default, variazione_massima_pct, limite_tasso_crescita, orizzonte_default,
        intensita_minima_attenzione, aggiornato_il)
     VALUES (1, $1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET aliquota_imposte_default = EXCLUDED.aliquota_imposte_default,
       variazione_massima_pct = EXCLUDED.variazione_massima_pct,
       limite_tasso_crescita = EXCLUDED.limite_tasso_crescita,
       orizzonte_default = EXCLUDED.orizzonte_default,
       intensita_minima_attenzione = EXCLUDED.intensita_minima_attenzione,
       aggiornato_il = now()`,
    [
      parametri?.aliquotaImposteDefault ?? null,
      parametri?.variazioneMassimaPct ?? null,
      parametri?.limiteTassoCrescita ?? null,
      parametri?.orizzonteDefault ?? null,
      parametri?.intensitaMinimaAttenzione ?? null,
    ]
  );
}
