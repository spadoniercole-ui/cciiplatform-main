// src/lib/mfa/tipi.ts
//
// Tipi condivisi dell'MFA. Tenuti fuori da actions/mfa.ts perché un file
// 'use server' può esportare solo funzioni async: i tipi vivono qui.

export type FattoreMfa = 'TOTP_ENROLL' | 'TOTP' | 'PIN_SETUP' | 'PIN';

export interface DatiAvvioChallenge {
  identitaKey: string;
  ruolo: 'SUPERADMIN' | 'USER';
  workspaceId: number | null;
  email: string | null;
  username: string;
  codiceSpazio: string | null;
  tenantId: string | null;
  goToChoice: boolean;
}

export interface StatoMfa {
  attivo: boolean;
  fase?: FattoreMfa;
  username?: string | null;
  enroll?: { segreto: string; otpauthUri: string; qrDataUrl: string };
}

export type RispostaPassoMfa =
  | {
      success: true;
      completato: true;
      role: 'SUPERADMIN' | 'USER';
      goToChoice: boolean;
      tenantName: string | null;
      tenantId: string | null;
    }
  | { success: true; completato: false; next: FattoreMfa }
  | { success: false; error: string };
