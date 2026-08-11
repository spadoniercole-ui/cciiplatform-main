'use server';

import { PlatformLicense, TenantUsageCounters } from '@/types/platform';
import { checkLicenseCompliance } from '@/lib/licenseEngine';

// Interfaccia finta per il tuo ORM/Database (es. Prisma, Supabase o Mongoose)
// Sostituisci questi mock con le chiamate reali al tuo database
const db = {
  tenant: {
    update: async (id: string, data: any) => true,
    getUsageCounters: async (id: string): Promise<TenantUsageCounters> => {
      // Recupera i contatori reali attuali dal DB per evitare manomissioni lato client
      return { activeUsers: 2, activeCompanies: 3, activeWorkspaces: 1 };
    },
  },
  auditLog: {
    create: async (log: { action: string; target: string; operator: string; details: string }) =>
      true,
  },
};

interface ActionResponse {
  success: boolean;
  error?: string;
  code?: 'UNAUTHORIZED' | 'REGRESSION_ERROR' | 'INVALID_DATA' | 'DB_ERROR';
}

/**
 * LA FUNZIONE LICENZA PERFETTA
 * Esegue la validazione formale, il controllo di regressione logica,
 * la persistenza sul DB e la scrittura immutabile nei log.
 */
export async function saveLicenseAction(
  tenantId: string,
  newLicenseData: PlatformLicense,
  operatorSession: { role: string; username: string } // Recuperata dal tuo auth di sistema (es. NextAuth)
): Promise<ActionResponse> {
  // 1. VERIFICA DI SICUREZZA ORIGINARIA (RBAC)
  if (operatorSession.role !== 'SUPER_ADMIN') {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Operazione rifiutata: autorizzazioni superadmin mancanti.',
    };
  }

  // 2. SANITIZZAZIONE E VALIDAZIONE FORMALE DEI DATI RICEVUTI
  if (!newLicenseData.activatedAt || !newLicenseData.expiresAt) {
    return {
      success: false,
      code: 'INVALID_DATA',
      error: 'Le date di attivazione e scadenza sono obbligatorie.',
    };
  }

  if (newLicenseData.activatedAt > newLicenseData.expiresAt) {
    return {
      success: false,
      code: 'INVALID_DATA',
      error: 'La data di attivazione non può essere successiva alla data di scadenza.',
    };
  }

  if (
    newLicenseData.maxUsers <= 0 ||
    newLicenseData.maxCompanies <= 0 ||
    newLicenseData.maxWorkspaces <= 0
  ) {
    return {
      success: false,
      code: 'INVALID_DATA',
      error: 'I limiti quantitativi devono essere maggiori di zero.',
    };
  }

  try {
    // 3. CONTROLLO DI REGREZZIONE (Verifica sul database reale, non sul client)
    const currentCounters = await db.tenant.getUsageCounters(tenantId);

    if (newLicenseData.maxUsers < currentCounters.activeUsers) {
      return {
        success: false,
        code: 'REGRESSION_ERROR',
        error: `Impossibile applicare le restrizioni. Il tenant ha attualmente ${currentCounters.activeUsers} utenti attivi. Rimuovere prima le utenze in esubero.`,
      };
    }

    if (newLicenseData.maxCompanies < currentCounters.activeCompanies) {
      return {
        success: false,
        code: 'REGRESSION_ERROR',
        error: `Impossibile salvare. Il piano proposto prevede max ${newLicenseData.maxCompanies} aziende, ma il cliente ne sta monitorando ${currentCounters.activeCompanies}.`,
      };
    }

    if (newLicenseData.maxWorkspaces < currentCounters.activeWorkspaces) {
      return {
        success: false,
        code: 'REGRESSION_ERROR',
        error: `Soglia spazi non valida. Ci sono già ${currentCounters.activeWorkspaces} spazi operativi censiti.`,
      };
    }

    // 4. SCRITTURA ATOMICA SUL DATABASE
    // Aggiorna l'oggetto licenza dentro il record del Tenant specifico
    const dbUpdateSuccess = await db.tenant.update(tenantId, {
      license: {
        tier: newLicenseData.tier,
        status: newLicenseData.status,
        maxUsers: newLicenseData.maxUsers,
        maxCompanies: newLicenseData.maxCompanies,
        maxWorkspaces: newLicenseData.maxWorkspaces,
        activatedAt: newLicenseData.activatedAt,
        expiresAt: newLicenseData.expiresAt,
      },
    });

    if (!dbUpdateSuccess) {
      throw new Error('Il Database non ha confermato la scrittura della riga.');
    }

    // 5. SCRITTURA NEL REGISTRO DI AUDIT IMMUTABILE
    // Riproduce esattamente lo stile di tracciamento visibile nello screenshot
    const logDetails = `Tier: ${newLicenseData.tier} | Status: ${newLicenseData.status} | Limiti [U:${newLicenseData.maxUsers}, A:${newLicenseData.maxCompanies}, S:${newLicenseData.maxWorkspaces}]`;

    await db.auditLog.create({
      action: 'MODIFICA_LICENZA',
      target: tenantId,
      operator: operatorSession.username,
      details: logDetails,
    });

    return { success: true };
  } catch (dbError: any) {
    console.error('CRITICAL DB ERROR in saveLicenseAction:', dbError);
    return {
      success: false,
      code: 'DB_ERROR',
      error: 'Errore interno del database durante la persistenza dei dati commerciali.',
    };
  }
}
