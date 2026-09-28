import { describe, it, expect } from 'vitest';
import { SOGLIE_DI_LEGGE } from './parametri';
import { SOGLIE_25NOVIES } from './calcolo';

// ATTENZIONE: questi sono i valori dell'art. 25-novies, comma 1, CCII
// (D.Lgs. 14/2019 come modificato dal D.Lgs. 136/2024). Il test li fissa a
// mano, volutamente senza snapshot: se fallisce, NON aggiornare i numeri qui
// per farlo passare. Cambiare una soglia di legge richiede l'approvazione di
// un professionista e l'aggiornamento, insieme, di src/lib/normativa/dati.ts,
// di src/lib/soglie25novies/calcolo.ts, di
// docs/CHECKLIST_VALIDAZIONE_NORMATIVA.md e del CHANGELOG.

describe('SOGLIE_DI_LEGGE', () => {
  it('coincidono con i valori dell’art. 25-novies, comma 1', () => {
    expect(SOGLIE_DI_LEGGE).toStrictEqual({
      inpsPercentuale: 0.3,
      inpsImportoConLavoratori: 15_000,
      inpsImportoSenzaLavoratori: 5_000,
      inail: 5_000,
      ivaImporto: 5_000,
      ivaPercentualeVolumeAffari: 0.1,
      ivaImportoAssoluto: 20_000,
      aerImpresaIndividuale: 100_000,
      aerSocietaPersone: 200_000,
      aerAltreSocieta: 500_000,
      giorniRitardo: 90,
    });
  });

  it('sono la stessa fonte usata dal calcolo (nessuna chiave in più o in meno)', () => {
    expect(SOGLIE_DI_LEGGE).toStrictEqual({ ...SOGLIE_25NOVIES });
  });
});
