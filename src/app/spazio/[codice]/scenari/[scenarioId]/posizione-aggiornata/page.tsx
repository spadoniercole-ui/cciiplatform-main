import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { destinazioneRitorno } from '@/lib/ritorno';
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
  const rit = destinazioneRitorno(codice, scenarioId, ritorno);
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
      ritornoA={rit?.url ?? null}
      ritornoDa={rit?.da}
      ritornoPulsante={rit?.pulsante}
    />
  );
}
