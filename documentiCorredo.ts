import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ScenarioXbrlManager } from '@/components/spazio/ScenarioXbrlManager';

export default async function XbrlScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE' && (contesto.permessi?.xbrl || 'NESSUNO') === 'NESSUNO') {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  const risultato = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!risultato.success || !risultato.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }

  return (
    <ScenarioXbrlManager
      nomeSchema={contesto.nomeSchema}
      aziendaId={risultato.scenario!.aziendaId}
      scenarioId={Number(scenarioId)}
    />
  );
}
