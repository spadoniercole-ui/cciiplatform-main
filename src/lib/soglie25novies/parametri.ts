// src/lib/soglie25novies/parametri.ts
//
// Forma dei parametri delle soglie e valori DI LEGGE.
//
// Sta fuori da un file 'use server' perché lì ogni export non-funzione è
// vietato: le costanti diventerebbero endpoint. Ed è comunque il posto
// giusto, perché questi valori servono sia al server sia all'interfaccia,
// che mostra il valore di legge accanto a quello impostato.

import { SOGLIE_25NOVIES } from './calcolo';

export interface ParametriSoglie {
  inpsPercentuale: number;
  inpsImportoConLavoratori: number;
  inpsImportoSenzaLavoratori: number;
  inail: number;
  ivaImporto: number;
  ivaPercentualeVolumeAffari: number;
  ivaImportoAssoluto: number;
  aerImpresaIndividuale: number;
  aerSocietaPersone: number;
  aerAltreSocieta: number;
  giorniRitardo: number;
}

/** I valori dell'articolo. Riferimento fisso per il confronto a video. */
export const SOGLIE_DI_LEGGE: ParametriSoglie = {
  inpsPercentuale: SOGLIE_25NOVIES.inpsPercentuale,
  inpsImportoConLavoratori: SOGLIE_25NOVIES.inpsImportoConLavoratori,
  inpsImportoSenzaLavoratori: SOGLIE_25NOVIES.inpsImportoSenzaLavoratori,
  inail: SOGLIE_25NOVIES.inail,
  ivaImporto: SOGLIE_25NOVIES.ivaImporto,
  ivaPercentualeVolumeAffari: SOGLIE_25NOVIES.ivaPercentualeVolumeAffari,
  ivaImportoAssoluto: SOGLIE_25NOVIES.ivaImportoAssoluto,
  aerImpresaIndividuale: SOGLIE_25NOVIES.aerImpresaIndividuale,
  aerSocietaPersone: SOGLIE_25NOVIES.aerSocietaPersone,
  aerAltreSocieta: SOGLIE_25NOVIES.aerAltreSocieta,
  giorniRitardo: SOGLIE_25NOVIES.giorniRitardo,
};
