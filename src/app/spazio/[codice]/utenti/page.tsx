import { redirect } from 'next/navigation';
import { UserCog, AlertTriangle } from 'lucide-react';
import { ottieniContestoAccessoSpazio, ottieniAdminSpazio } from '@/app/actions/spazi';
import { RigeneraPasswordAdmin } from '@/components/spazi/RigeneraPasswordAdmin';
import { UtentiManager } from '@/components/spazio/UtentiManager';

// Utenti dello Spazio: l'Admin di Spazio (con rigenerazione password) più
// la gestione reale di Operativi e Consultatori, associabili alle aziende.

export default async function UtentiSpazioPage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`); // Gestione dello spazio: mai a un Operatore/Consultatore

  const risultatoAdmin = await ottieniAdminSpazio(contesto.nomeSchema);

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Utenti dello Spazio</h1>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <UserCog className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Admin di Spazio ({risultatoAdmin.admins.length})
          </h2>
        </div>

        {!risultatoAdmin.success && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {risultatoAdmin.error}
          </div>
        )}

        {risultatoAdmin.success && risultatoAdmin.admins.length === 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Nessun Admin di Spazio trovato in questo schema.
          </div>
        )}

        {risultatoAdmin.admins.map((admin) => (
          <div key={admin.id} className="border border-slate-200 rounded-lg p-3">
            <div className="font-bold text-slate-900 text-xs">
              {admin.nome} {admin.cognome}
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-1">{admin.email}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{admin.cellulare}</div>
            <RigeneraPasswordAdmin
              nomeSchema={contesto.nomeSchema}
              adminId={admin.id}
              email={admin.email}
            />
          </div>
        ))}
      </div>

      <UtentiManager nomeSchema={contesto.nomeSchema} />
    </div>
  );
}
