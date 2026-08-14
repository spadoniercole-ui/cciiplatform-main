'use server';

// Dettagli della licenza operativa di uno spazio — quello che il
// superadmin imposta DAVVERO e che è rilevante per l'Admin di Spazio
// vedere in sola lettura. Sostituisce la vecchia lettura di
// "parametri_sistema" (una tabella morta: nessuna interfaccia superadmin
// vi scrive più da quando "Soglie Normative CCII" fu rimossa), che
// mostrava dati residui senza che nessuno potesse più aggiornarli.

import { pool } from '@/lib/db';
import { assicuraTabelleSpazi } from '@/db/ensureTables';

export interface LicenzaOperativaSpazio {
  tier: string;
  statoLicenza: string;
  maxUtenti: number;
  maxAziende: number;
  dataScadenza: string | null;
  plusDatiSettore: boolean;
  plusSimulazione: boolean;
  plusRelazioneAi: boolean;
  ragioneSocialeLicenzaCommerciale: string | null;
}

export interface RisultatoLicenzaOperativaSpazio {
  success: boolean;
  licenza: LicenzaOperativaSpazio | null;
  error?: string;
}

export async function ottieniLicenzaOperativaSpazio(
  nomeSchema: string
): Promise<RisultatoLicenzaOperativaSpazio> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, licenza: null, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleSpazi();
    const risultato = await pool.query(
      `SELECT l.tier, l.stato AS stato_licenza, l.max_utenti, l.max_aziende, l.data_scadenza,
              l.plus_dati_settore, l.plus_simulazione, l.plus_relazione_ai,
              lc.ragione_sociale AS ragione_sociale_licenza_commerciale
       FROM public.spazi s
       JOIN public.licenze_spazio l ON l.spazio_id = s.id
       LEFT JOIN public.licenze lc ON lc.id_licenza = l.licenza_commerciale_id
       WHERE s.nome_schema = $1`,
      [nomeSchema]
    );
    if (risultato.rows.length === 0) {
      return { success: true, licenza: null };
    }
    const r = risultato.rows[0];
    return {
      success: true,
      licenza: {
        tier: r.tier,
        statoLicenza: r.stato_licenza,
        maxUtenti: r.max_utenti,
        maxAziende: r.max_aziende,
        dataScadenza: r.data_scadenza,
        plusDatiSettore: r.plus_dati_settore,
        plusSimulazione: r.plus_simulazione,
        plusRelazioneAi: r.plus_relazione_ai,
        ragioneSocialeLicenzaCommerciale: r.ragione_sociale_licenza_commerciale,
      },
    };
  } catch (error: any) {
    console.error('[ottieniLicenzaOperativaSpazio] Errore:', error);
    return {
      success: false,
      licenza: null,
      error: `Impossibile caricare la licenza: ${error.message || error}`,
    };
  }
}
