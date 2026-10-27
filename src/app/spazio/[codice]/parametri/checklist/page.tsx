import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ChecklistPesiManager } from '@/components/spazio/ChecklistPesiManager';
import { ChecklistParametriTabs } from '@/components/spazio/ChecklistParametriTabs';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

export default async function ParametriChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ modello?: string; ritorno?: string }>;
}) {
  const { codice } = await params;
  const { modello, ritorno } = await searchParams;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  return (
    <div className="max-w-5xl space-y-4">
      <LinkRitorno codice={codice} ritorno={ritorno} />

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
