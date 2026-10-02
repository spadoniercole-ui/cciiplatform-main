import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { PosizioneAggiornataScenario } from '@/components/spazio/PosizioneAggiornataScenario';

export default async function PosizioneAggiornataPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
  searchParams: Promise<{ ritorno?: string }>;
}) {
  const { codice, scenarioId } = await params;
  const { ritorno } = await searchParams;
  // Solo destinazioni note, costruite qui: mai un URL arbitrario dal browser.
  const ritornoA =
    ritorno === 'valutazione'
      ? `/spazio/${codice}/scenari/${scenarioId}/proposta#valutazione`
      : null;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  const risultato = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!risultato.success || !risultato.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }
  const scenario = risultato.scenario!;

  return (
    <PosizioneAggiornataScenario
      nomeSchema={contesto.nomeSchema}
      codice={codice}
      scenarioId={Number(scenarioId)}
      aziendaId={scenario.aziendaId}
      nomeScenario={scenario.nome}
      ritornoA={ritornoA}
    />
  );
}
