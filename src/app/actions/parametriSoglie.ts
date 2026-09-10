'use server';

// Soglie di segnalazione dell'art. 25-novies, configurabili per spazio.
//
// Gli importi sono di LEGGE, non nostri. I valori predefiniti sono quelli
// dell'articolo; la tabella esiste perché una riforma non debba imporre una
// nuova release, non perché ogni ente scelga le proprie soglie.
//
// Chi modifica un valore qui cambia l'esito di una valutazione. Perciò
// l'interfaccia mostra sempre il valore di legge accanto a quello impostato
// e consente di ripristinarlo: uno scostamento deve restare visibile, non
// diventare la nuova normalità che nessuno ricorda di aver introdotto.

import { pool } from '@/lib/db';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import { SOGLIE_DI_LEGGE, type ParametriSoglie } from '@/lib/soglie25novies/parametri';

export type { ParametriSoglie };

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export async function ottieniParametriSoglieAction(
  nomeSchema: string
): Promise<{ success: boolean; parametri?: ParametriSoglie; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);
    const r = await pool.query(
      `SELECT * FROM "${nomeSchema}".parametri_soglie_25novies WHERE id = 1`
    );
    // Tabella appena creata e riga non ancora presente: si torna la legge.
    if (r.rows.length === 0) return { success: true, parametri: { ...SOGLIE_DI_LEGGE } };
    const x = r.rows[0];
    return {
      success: true,
      parametri: {
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
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniParametriSoglieAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export async function salvaParametriSoglieAction(
  nomeSchema: string,
  p: ParametriSoglie
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    // Nessun valore può essere negativo o assente: una soglia a zero
    // renderebbe "oltre soglia" qualunque esposizione, anche di un euro.
    for (const [chiave, valore] of Object.entries(p)) {
      if (!Number.isFinite(valore) || (valore as number) < 0) {
        return { success: false, error: `Valore non valido per ${chiave}.` };
      }
    }
    await assicuraTabelleParametriSpazio(nomeSchema);
    await pool.query(
      `UPDATE "${nomeSchema}".parametri_soglie_25novies SET
         inps_percentuale = $1, inps_importo_con_lavoratori = $2,
         inps_importo_senza_lavoratori = $3, inail = $4, iva_importo = $5,
         iva_percentuale_volume_affari = $6, iva_importo_assoluto = $7,
         aer_impresa_individuale = $8, aer_societa_persone = $9,
         aer_altre_societa = $10, giorni_ritardo = $11, aggiornato_il = now()
       WHERE id = 1`,
      [
        p.inpsPercentuale,
        p.inpsImportoConLavoratori,
        p.inpsImportoSenzaLavoratori,
        p.inail,
        p.ivaImporto,
        p.ivaPercentualeVolumeAffari,
        p.ivaImportoAssoluto,
        p.aerImpresaIndividuale,
        p.aerSocietaPersone,
        p.aerAltreSocieta,
        p.giorniRitardo,
      ]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[salvaParametriSoglieAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}
