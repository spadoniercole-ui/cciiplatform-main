import { PlatformLicense, TenantUsageCounters } from '@/types/platform';

export interface LicenseCheckResult {
  isValid: boolean;
  blockReason?:
    | 'SERVIZIO_SOSPESO'
    | 'LICENZA_SCADUTA'
    | 'CONTRATTO_CHIUSO'
    | 'SOGLIA_UTENTI_SUPERATA'
    | 'SOGLIA_AZIENDE_SUPERATA'
    | 'SOGLIA_SPAZI_SUPERATA';
  errorMessage?: string;
}

/**
 * Valuta lo stato amministrativo e i limiti quantitativi di un tenant.
 * Evita che un utente aggiri i limiti contrattuali via API.
 */
export function checkLicenseCompliance(
  license: PlatformLicense,
  counters: TenantUsageCounters
): LicenseCheckResult {
  // Cattura la data odierna in formato ISO puro (YYYY-MM-DD)
  const today = new Date().toISOString().substring(0, 10);

  // 1. CONTROLLI DI STATO COERCITIVI (Blocchi amministrativi)
  if (license.status === 'SUSPENDED') {
    return {
      isValid: false,
      blockReason: 'SERVIZIO_SOSPESO',
      errorMessage:
        'Accesso sospeso per motivi amministrativi. I dati rimangono integri ma le funzioni di calcolo e modifica sono disabilitate.',
    };
  }

  if (license.status === 'CLOSED') {
    return {
      isValid: false,
      blockReason: 'CONTRATTO_CHIUSO',
      errorMessage:
        'Il contratto associato a questo spazio è stato chiuso definitivamente. Accesso revocato.',
    };
  }

  // 2. CONTROLLO SCADENZA TEMPORALE
  if (license.status === 'EXPIRED' || (license.expiresAt && license.expiresAt < today)) {
    return {
      isValid: false,
      blockReason: 'LICENZA_SCADUTA',
    };
  }

  // 3. CONTROLLI SULLE SOGLIE QUANTITATIVE (Prevenzione over-quota)
  if (counters.activeUsers > license.maxUsers) {
    return {
      isValid: false,
      blockReason: 'SOGLIA_UTENTI_SUPERATA',
      errorMessage: `Impossibile completare l'operazione. Il piano contrattuale prevede un massimo di ${license.maxUsers} utenti attivi.`,
    };
  }

  if (counters.activeCompanies > license.maxCompanies) {
    return {
      isValid: false,
      blockReason: 'SOGLIA_AZIENDE_SUPERATA',
      errorMessage: `Limite licenza raggiunto. Il piano attuale consente il monitoraggio di massimo ${license.maxCompanies} aziende (Partite IVA).`,
    };
  }

  if (counters.activeWorkspaces > license.maxWorkspaces) {
    return {
      isValid: false,
      blockReason: 'SOGLIA_SPAZI_SUPERATA',
      errorMessage: `Soglia massima configurabile raggiunta: massimo ${license.maxWorkspaces} spazi operativi consentiti.`,
    };
  }

  // Se passa tutti i controlli, il semaforo è verde
  return { isValid: true };
}
