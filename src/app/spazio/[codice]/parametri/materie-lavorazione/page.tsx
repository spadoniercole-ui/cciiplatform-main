import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { MaterieLavorazioneManager } from '@/components/spazio/MaterieLavorazioneManager';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

// `?materia=<id>` è il punto di arrivo dei link del triage: dice quale
// lavorazione manca, così chi clicca non deve cercarla fra le materie.
export default async function ParametriMaterieLavorazionePage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ materia?: string; ritorno?: string }>;
}) {
  const { codice } = await params;
  const { materia, ritorno } = await searchParams;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE' || contesto.tipoSpazio !== 'ENTE')
    redirect(`/spazio/${codice}`);
  const materiaId = Number(materia);
  const apriMateriaId = Number.isInteger(materiaId) && materiaId > 0 ? materiaId : null;
  return (
    <div className="max-w-5xl space-y-4">
      <LinkRitorno codice={codice} ritorno={ritorno} />
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <MaterieLavorazioneManager
          nomeSchema={contesto.nomeSchema}
          codice={codice}
          apriMateriaId={apriMateriaId}
          ritorno={ritorno}
        />
      </div>
    </div>
  );
}
