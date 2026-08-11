'use client';

import { useState, useEffect, useCallback } from 'react';

// Struttura dei dati di sessione esposti a tutte le pagine
interface PlatformSession {
  role: string;
  currentTenant: string;
  isInspection: boolean;
  is2FAValidated: boolean;
  loading: boolean;
}

export function usePlatformData(moduloId: string) {
  const [session, setSession] = useState<PlatformSession>({
    role: '',
    currentTenant: 'Amministrazione Globale',
    isInspection: false,
    is2FAValidated: false,
    loading: true,
  });

  // Caricamento asincrono e sicuro dei dati di sessione (lato client)
  useEffect(() => {
    const role = sessionStorage.getItem('role') || 'OPERATORE';
    const currentTenant = sessionStorage.getItem('currentTenant') || 'Spazio Non Definito';
    const isInspection = sessionStorage.getItem('inspectionMode') === 'true';
    const token2FA = sessionStorage.getItem('token_2fa');

    // Un utente è validato al 2° livello se ha il token esplicito VALIDO
    const is2FAValidated = token2FA === 'VALIDO';

    setSession({
      role,
      currentTenant,
      isInspection,
      is2FAValidated,
      loading: false,
    });
  }, []);

  /**
   * MATRICE DI PERMESSO GERARCHICA (RBAC)
   * Determina in tempo reale se l'utente corrente può modificare un record.
   */
  const checkPermission = useCallback((): { allowed: boolean; reason: string } => {
    const normalizedRole = session.role.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    // 1. Il superadmin bypassa qualunque blocco normativo o di contesto
    if (normalizedRole === 'SUPER_ADMIN' || normalizedRole === 'superadmin') {
      return { allowed: true, reason: 'BYPASS_SUPER_ADMIN' };
    }

    // 2. Amministratori e Operatori di spazio necessitano del Token di Secondo Livello (OTP simulato)
    if (!session.is2FAValidated) {
      return { allowed: false, reason: 'TOKEN_2FA_MANCANTE' };
    }

    return { allowed: true, reason: 'SESSIONE_AUTORIZZATA' };
  }, [session]);

  /**
   * STRUMENTO DI MUTAZIONE UNIFICATO
   * Qualsiasi salvataggio, modifica o cancellazione in piattaforma deve passare da qui.
   * Controlla i permessi e, se validi, esegue la logica e scrive l'Audit Log.
   */
  const executeMutation = useCallback(
    (
      actionName: string,
      targetDescription: string,
      onSuccessCallback: () => void
    ): { success: boolean; error?: string } => {
      const auth = checkPermission();

      if (!auth.allowed) {
        return {
          success: false,
          error:
            auth.reason === 'TOKEN_2FA_MANCANTE'
              ? 'Azione bloccata: Modifica richiedente validazione con token di 2° livello.'
              : 'Operazione non autorizzata per il tuo livello di permessi.',
        };
      }

      // Esegue l'operazione logica richiesta dalla pagina
      onSuccessCallback();

      // Iniezione automatica e standardizzata dell'evento nel registro di Audit di sistema
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const newAuditLog = {
        timestamp,
        action: actionName,
        target: targetDescription,
        operator:
          session.role === 'SUPER_ADMIN' && session.isInspection
            ? `superadmin (Ispezione: ${session.currentTenant})`
            : `${session.role} (${session.currentTenant})`,
      };

      // Recupera lo storico dei log全局, inserisce il nuovo e salva
      const currentLogs = JSON.parse(localStorage.getItem('platform_audit_logs') || '[]');
      localStorage.setItem('platform_audit_logs', JSON.stringify([newAuditLog, ...currentLogs]));

      return { success: true };
    },
    [session, checkPermission]
  );

  return {
    ...session,
    canEdit: checkPermission().allowed,
    executeMutation,
  };
}
