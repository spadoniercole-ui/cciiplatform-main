import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { TitoliEnteManager } from '@/components/spazio/TitoliEnteManager';

export default async function ParametriTitoliEntePage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE' || contesto.tipoSpazio !== 'ENTE')
    redirect(`/spazio/${codice}`);
  return (
    <div className="max-w-5xl space-y-4">
      <Link
        href={`/spazio/${codice}/parametri`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna a Parametri di Spazio
      </Link>
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <TitoliEnteManager nomeSchema={contesto.nomeSchema} codice={codice} />
      </div>
    </div>
  );
}
