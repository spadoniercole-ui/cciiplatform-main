import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ChecklistScenario } from '@/components/spazio/ChecklistScenario';

export default async function CheckListScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (
    contesto.modalita === 'OPERATORE' &&
    (contesto.permessi?.checklist || 'NESSUNO') === 'NESSUNO'
  ) {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  return (
    <ChecklistScenario
      nomeSchema={contesto.nomeSchema}
      scenarioId={Number(scenarioId)}
      codice={codice}
    />
  );
}
