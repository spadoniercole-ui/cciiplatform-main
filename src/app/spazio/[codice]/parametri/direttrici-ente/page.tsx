import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { DirettriciEnteConfigManager } from '@/components/spazio/DirettriciEnteConfigManager';
import { ScreeningLimitiControl } from '@/components/spazio/ScreeningLimitiControl';
import { ScreeningMaxTokensControl } from '@/components/spazio/ScreeningMaxTokensControl';

export default async function ParametriDirettriciEntePage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  return (
    <div className="max-w-4xl space-y-4">
      <Link
        href={`/spazio/${codice}/parametri`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna a Parametri di Spazio
      </Link>
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <DirettriciEnteConfigManager nomeSchema={contesto.nomeSchema} />
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <ScreeningLimitiControl nomeSchema={contesto.nomeSchema} />
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <ScreeningMaxTokensControl nomeSchema={contesto.nomeSchema} />
      </div>
    </div>
  );
}
