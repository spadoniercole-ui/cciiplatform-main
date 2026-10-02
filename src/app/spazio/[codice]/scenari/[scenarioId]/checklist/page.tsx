import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ChecklistScenario } from '@/components/spazio/ChecklistScenario';
import { destinazioneRitorno } from '@/lib/ritorno';
import { BannerRitorno } from '@/components/spazio/BannerRitorno';

export default async function CheckListScenarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
  searchParams: Promise<{ ritorno?: string }>;
}) {
  const { codice, scenarioId } = await params;
  const rit = destinazioneRitorno(codice, scenarioId, (await searchParams).ritorno);
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (
    contesto.modalita === 'OPERATORE' &&
    (contesto.permessi?.checklist || 'NESSUNO') === 'NESSUNO'
  ) {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  return (
    <div className="space-y-4">
      {rit && <BannerRitorno ritorno={rit} />}
      <ChecklistScenario
        nomeSchema={contesto.nomeSchema}
        scenarioId={Number(scenarioId)}
        codice={codice}
      />
    </div>
  );
}
