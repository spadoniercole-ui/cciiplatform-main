// LETTURA DEI PARAMETRI DELLE SOGLIE (0.197.0).
//
// La configurazione si modifica solo dall'Admin, ma il documento di confronto
// dello scenario deve poter valutare le soglie anche per un Operatore. Qui
// vive la sola lettura, senza guardia: la decide chi chiama, che per la
// configurazione resta `ottieniParametriSoglieAction` (solo Admin).

import { pool } from '@/lib/db';
import { SOGLIE_DI_LEGGE, type ParametriSoglie } from '@/lib/soglie25novies/parametri';

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

export async function leggiParametriSoglie(nomeSchema: string): Promise<ParametriSoglie> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');

  // Spazio appena creato o tabella non ancora provisionata: valgono i valori
  // di legge, gli stessi che la configurazione mostrerebbe come predefiniti.
  const esistenza = await pool.query(`SELECT to_regclass($1) AS tabella`, [
    `${nomeSchema}.parametri_soglie_25novies`,
  ]);
  if (!esistenza.rows[0]?.tabella) return { ...SOGLIE_DI_LEGGE };

  const r = await pool.query(
    `SELECT * FROM "${nomeSchema}".parametri_soglie_25novies WHERE id = 1`
  );
  if (r.rows.length === 0) return { ...SOGLIE_DI_LEGGE };

  const x = r.rows[0];
  return {
    inpsPercentuale: Number(x.inps_percentuale),
    inpsImportoConLavoratori: Number(x.inps_importo_con_lavoratori),
    inpsImportoSenzaLavoratori: Number(x.inps_importo_senza_lavoratori),
    inail: Number(x.inail),
    ivaImporto: Number(x.iva_importo),
    ivaPercentualeVolumeAffari: Number(x.iva_percentuale_volume_affari),
    ivaImportoAssoluto: Number(x.iva_importo_assoluto),
    aerImpresaIndividuale: Number(x.aer_impresa_individuale),
    aerSocietaPersone: Number(x.aer_societa_persone),
    aerAltreSocieta: Number(x.aer_altre_societa),
    giorniRitardo: Number(x.giorni_ritardo),
  };
}
