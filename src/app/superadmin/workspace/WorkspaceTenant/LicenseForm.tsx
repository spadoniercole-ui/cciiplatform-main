import { useState } from 'react';
import { PlatformLicense, TenantUsageCounters } from '@/types/platform';
import { THEME } from '@/lib/theme';

interface WorkspaceTenant {
  id: string;
  tenantId: string;
  ragioneSociale?: string;
  [key: string]: any;
}

interface LicenseFormProps {
  tenant: WorkspaceTenant;
  currentCounters: TenantUsageCounters;
  onSave: (updatedLicense: PlatformLicense) => Promise<boolean>;
}

/**
 * Helper per formattare in modo sicuro le date nel formato YYYY-MM-DD richiesto dall'input HTML.
 * Evita errori di compilazione con tipi misti (Date, string, null, undefined).
 */
const formatDateForInput = (dateValue: string | Date | null | undefined): string => {
  if (!dateValue) return '';
  if (dateValue instanceof Date) {
    return dateValue.toISOString().split('T')[0];
  }
  if (typeof dateValue === 'string') {
    return dateValue.split('T')[0];
  }
  return '';
};

export default function LicenseForm({ tenant, currentCounters, onSave }: LicenseFormProps) {
  const [license, setLicense] = useState<PlatformLicense>({ ...tenant.license });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    // Esegue il salvataggio sul database (passando dall'API tracciata dall'Audit Log)
    const success = await onSave(license);

    setIsSaving(false);
    if (success) {
      setMessage({
        type: 'success',
        text: "Licenza commerciale aggiornata con successo. Modifica registrata nell'Audit Log.",
      });
    } else {
      setMessage({
        type: 'error',
        text: 'Errore durante la scrittura dei parametri sul database.',
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
    >
      <div className="border-b border-slate-100 pb-3">
        <h4 className="text-lg font-bold text-slate-900">Configurazione Commerciale & Licenza</h4>
        <p className="text-xs text-slate-500 mt-0.5">
          Spazio di lavoro:{' '}
          <span className="font-mono text-slate-700 bg-slate-50 px-1 rounded">{tenant.id}</span>
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm font-semibold border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* RIGA 1: STATO E SCAGLIONE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="tierSelect" className={THEME.label}>
            Scaglione Commerciale (Tier)
          </label>
          <select
            id="tierSelect"
            name="tierSelect"
            className={`${THEME.combo} text-slate-900 bg-white`}
            value={license.tier}
            onChange={(e) => setLicense({ ...license, tier: e.target.value as any })}
          >
            <option value="MICRO">Micro Impresa</option>
            <option value="PMI">PMI Standard</option>
            <option value="HOLDING">Holding / Gruppi</option>
            <option value="CUSTOM">Contratto Custom / Sartoriale</option>
          </select>
        </div>

        <div>
          <label htmlFor="statusSelect" className={THEME.label}>
            Stato Amministrativo Accesso
          </label>
          <select
            id="statusSelect"
            name="statusSelect"
            className={`${THEME.combo} text-slate-900 bg-white font-bold ${
              license.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'
            }`}
            value={license.status}
            onChange={(e) => setLicense({ ...license, status: e.target.value as any })}
          >
            <option value="ACTIVE">🟢 Attiva (Accesso Consentito)</option>
            <option value="SUSPENDED">🟡 Sospesa (Mancato Pagamento)</option>
            <option value="EXPIRED">🔴 Scaduta (Termini di Contratto)</option>
            <option value="CLOSED">⚫ Chiusa (Recesso Permanente)</option>
          </select>
        </div>
      </div>

      {/* RIGA 2: CONTROLLO DEI LIMITI NUMERICI CON VISUALIZZAZIONE DELLO STATO REALE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
        <div>
          <label htmlFor="maxUsers" className={THEME.label}>
            Max Utenti Attivabili
          </label>
          <input
            id="maxUsers"
            name="maxUsers"
            type="number"
            min="1"
            className={`${THEME.input} text-slate-900 bg-white`}
            value={license.maxUsers}
            onChange={(e) => setLicense({ ...license, maxUsers: parseInt(e.target.value) || 1 })}
          />
          <p className="text-xs text-slate-500 mt-1">
            Utilizzati attualmente:{' '}
            <span className="font-bold text-slate-700">{currentCounters.activeUsers}</span>
          </p>
        </div>

        <div>
          <label htmlFor="maxCompanies" className={THEME.label}>
            Max Aziende (P.IVA)
          </label>
          <input
            id="maxCompanies"
            name="maxCompanies"
            type="number"
            min="1"
            className={`${THEME.input} text-slate-900 bg-white`}
            value={license.maxCompanies}
            onChange={(e) =>
              setLicense({ ...license, maxCompanies: parseInt(e.target.value) || 1 })
            }
          />
          <p className="text-xs text-slate-500 mt-1">
            Utilizzate attualmente:{' '}
            <span className="font-bold text-slate-700">{currentCounters.activeCompanies}</span>
          </p>
        </div>

        <div>
          <label htmlFor="maxWorkspaces" className={THEME.label}>
            Max Spazi Operativi
          </label>
          <input
            id="maxWorkspaces"
            name="maxWorkspaces"
            type="number"
            min="1"
            className={`${THEME.input} text-slate-900 bg-white`}
            value={license.maxWorkspaces}
            onChange={(e) =>
              setLicense({ ...license, maxWorkspaces: parseInt(e.target.value) || 1 })
            }
          />
          <p className="text-xs text-slate-500 mt-1">
            Utilizzati attualmente:{' '}
            <span className="font-bold text-slate-700">{currentCounters.activeWorkspaces}</span>
          </p>
        </div>
      </div>

      {/* RIGA 3: SCADENZE TEMPORALI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="activatedAt" className={THEME.label}>
            Data Attivazione
          </label>
          <input
            id="activatedAt"
            name="activatedAt"
            type="date"
            className={`${THEME.input} text-slate-900 bg-white`}
            value={formatDateForInput(license.activatedAt)}
            onChange={(e) => setLicense({ ...license, activatedAt: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="expiresAt" className={THEME.label}>
            Data Scadenza Contratto
          </label>
          <input
            id="expiresAt"
            name="expiresAt"
            type="date"
            className={`${THEME.input} text-slate-900 bg-white`}
            value={formatDateForInput(license.expiresAt)}
            onChange={(e) => setLicense({ ...license, expiresAt: e.target.value })}
          />
        </div>
      </div>

      {/* AZIONE DI SALVATAGGIO */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className={`${THEME.buttonPrimary} min-w-[200px] disabled:bg-slate-400`}
        >
          {isSaving ? '⏳ Scrittura a sistema...' : '💾 Applica Modifiche Licenza'}
        </button>
      </div>
    </form>
  );
}
