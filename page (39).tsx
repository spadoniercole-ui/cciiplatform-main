import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { IndiciScenario } from '@/components/spazio/IndiciScenario';

export default async function IndiciScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE' && (contesto.permessi?.indici || 'NESSUNO') === 'NESSUNO') {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  return <IndiciScenario nomeSchema={contesto.nomeSchema} scenarioId={Number(scenarioId)} />;
}
