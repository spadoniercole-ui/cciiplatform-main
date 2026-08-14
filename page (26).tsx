import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ChecklistPesiManager } from '@/components/spazio/ChecklistPesiManager';
import { ChecklistParametriTabs } from '@/components/spazio/ChecklistParametriTabs';

export default async function ParametriChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ modello?: string }>;
}) {
  const { codice } = await params;
  const { modello } = await searchParams;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  return (
    <div className="max-w-5xl space-y-4">
      <Link
        href={`/spazio/${codice}/parametri`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna a Parametri di Spazio
      </Link>

      {contesto.tipoSpazio !== 'ENTE' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <ChecklistPesiManager nomeSchema={contesto.nomeSchema} />
        </div>
      )}

      <ChecklistParametriTabs
        nomeSchema={contesto.nomeSchema}
        apriModelloId={modello ? Number(modello) : undefined}
        tipoSpazio={contesto.tipoSpazio}
      />
    </div>
  );
}
