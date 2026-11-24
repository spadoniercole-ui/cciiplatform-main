// I PARAMETRI DELLA SIMULAZIONE DEL PIANO — le leve che l'AI usa quando
// scrive le ipotesi del piano di sviluppo.
//
// Sono quattro valori che il codice teneva fissi: l'aliquota d'imposta con cui
// parte il calcolo quando lo storico non la rivela, l'ampiezza massima di una
// manopola, il tetto al tasso di crescita del riferimento automatico di settore
// e l'orizzonte proposto a chi apre un piano che non ne ha ancora uno salvato.
// Qui diventano dell'ente, uno per spazio.
//
// FINCHÉ NON SI TOCCANO, NULLA CAMBIA: i predefiniti sono esattamente i valori
// che il codice usava prima, e un campo non impostato (NULL nel database) vale
// il predefinito. Il parametro non introduce quindi un numero nuovo nel
// prodotto: sposta soltanto una decisione da chi scrive il codice a chi conosce
// il proprio spazio.

import { LIMITE_TASSO } from './automatico';
import { ORIZZONTE_MASSIMO } from './ricevente';

export interface ParametriSimulazionePiano {
  /** Aliquota d'imposta (%) usata quando lo storico non la rivela e l'AI non la indica. */
  aliquotaImposteDefault: number;
  /** Variazione massima (%) di una manopola, in entrambi i versi. */
  variazioneMassimaPct: number;
  /** Tetto (%) al tasso di crescita del riferimento automatico di settore. */
  limiteTassoCrescita: number;
  /** Anni del piano proposti quando lo scenario non ne ha ancora uno salvato. */
  orizzonteDefault: number;
}

/**
 * I valori che la simulazione usava già: 27,9% (IRES 24% + IRAP 3,9%),
 * ±50% sulle manopole, 20% di tetto alla crescita di settore, 5 anni.
 */
export const PARAMETRI_SIMULAZIONE_PREDEFINITI: ParametriSimulazionePiano = {
  aliquotaImposteDefault: 27.9,
  variazioneMassimaPct: 50,
  limiteTassoCrescita: LIMITE_TASSO,
  orizzonteDefault: 5,
};

/** Intervalli ammessi: gli stessi che la validazione delle ipotesi già impone. */
export const LIMITI_PARAMETRI_SIMULAZIONE: Record<
  keyof ParametriSimulazionePiano,
  { min: number; max: number; etichetta: string; unita: string }
> = {
  aliquotaImposteDefault: {
    min: 0,
    max: 60,
    etichetta: 'Aliquota d’imposta predefinita',
    unita: '%',
  },
  variazioneMassimaPct: {
    min: 1,
    max: 100,
    etichetta: 'Variazione massima di una manopola',
    unita: '%',
  },
  limiteTassoCrescita: {
    min: 0,
    max: 100,
    etichetta: 'Tetto al tasso di crescita di settore',
    unita: '%',
  },
  orizzonteDefault: {
    min: 1,
    max: ORIZZONTE_MASSIMO,
    etichetta: 'Orizzonte proposto del piano',
    unita: 'anni',
  },
};

const CAMPI = Object.keys(LIMITI_PARAMETRI_SIMULAZIONE) as (keyof ParametriSimulazionePiano)[];

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Unisce quello che lo spazio ha salvato con i predefiniti: un campo assente,
 * vuoto o fuori intervallo non blocca la simulazione, ricade sul predefinito.
 * La validazione stretta serve al salvataggio (`validaParametriSimulazione`),
 * non alla lettura.
 */
export function parametriSimulazioneValidi(
  salvati: Partial<Record<keyof ParametriSimulazionePiano, unknown>> | null | undefined
): ParametriSimulazionePiano {
  const esito = { ...PARAMETRI_SIMULAZIONE_PREDEFINITI };
  if (!salvati) return esito;
  for (const campo of CAMPI) {
    const n = numero(salvati[campo]);
    if (n === null) continue;
    const { min, max } = LIMITI_PARAMETRI_SIMULAZIONE[campo];
    if (n < min || n > max) continue;
    esito[campo] = campo === 'orizzonteDefault' ? Math.round(n) : n;
  }
  return esito;
}

/** Gli errori da mostrare a chi salva: elenco vuoto = tutto accettabile. */
export function validaParametriSimulazione(p: ParametriSimulazionePiano): string[] {
  const errori: string[] = [];
  for (const campo of CAMPI) {
    const { min, max, etichetta, unita } = LIMITI_PARAMETRI_SIMULAZIONE[campo];
    const v = p[campo];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errori.push(`${etichetta}: serve un numero.`);
      continue;
    }
    if (v < min || v > max) {
      errori.push(`${etichetta}: il valore deve stare fra ${min} e ${max} ${unita}.`);
      continue;
    }
    if (campo === 'orizzonteDefault' && !Number.isInteger(v)) {
      errori.push(`${etichetta}: gli anni sono un numero intero.`);
    }
  }
  return errori;
}
