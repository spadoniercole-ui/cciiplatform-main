export interface PlatformLicense {
  id: string;
  workspaceId: number | string;
  chiaveLicenza: string;
  tipo: 'trial' | 'standard' | 'enterprise' | string;
  stato: 'attiva' | 'scaduta' | 'sospesa' | string;
  dataInizio?: Date | string;
  dataScadenza?: Date | string | null;
  createdAt?: Date | string;
  activatedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  maxUsers: number; // Aggiunto per la validazione quantitativa a riga 56
  maxCompanies: number; // Aggiunto per la validazione quantitativa a riga 56
  maxWorkspaces: number; // Aggiunto per la validazione quantitativa a riga 56
  tier: string; // Aggiunto per risolvere riga 92
  status: string; // Aggiunto per risolvere riga 93
}

export interface TenantUsageCounters {
  id?: string;
  workspaceId?: number | string;
  activeUsers: number;
  activeCompanies: number;
  activeWorkspaces: number;
  analisiEseguite?: number;
  limiteAnalisi?: number;
  utentiAttivi?: number;
  limiteUtenti?: number;
}
