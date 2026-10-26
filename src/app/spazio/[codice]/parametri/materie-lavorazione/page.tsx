import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { MaterieLavorazioneManager } from '@/components/spazio/MaterieLavorazioneManager';

// `?materia=<id>` è il punto di arrivo dei link del triage: dice quale
// lavorazione manca, così chi clicca non deve cercarla fra le materie.
export default async function ParametriMaterieLavorazionePage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ materia?: string }>;
}) {
  const { codice } = await params;
  const { materia } = await searchParams;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE' || contesto.tipoSpazio !== 'ENTE')
    redirect(`/spazio/${codice}`);
  const materiaId = Number(materia);
  const apriMateriaId = Number.isInteger(materiaId) && materiaId > 0 ? materiaId : null;
  return (
    <div className="max-w-5xl space-y-4">
      <Link
        href={`/spazio/${codice}/parametri`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna a Parametri di Spazio
      </Link>
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <MaterieLavorazioneManager
          nomeSchema={contesto.nomeSchema}
          codice={codice}
          apriMateriaId={apriMateriaId}
        />
      </div>
    </div>
  );
}
