import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';
import { BrogliaccioEnteScenario } from '@/components/spazio/BrogliaccioEnteScenario';
import { BrogliaccioRedigenteScenario } from '@/components/spazio/BrogliaccioRedigenteScenario';

// Generare un livello qui innesca, silenziosamente, la ricerca web
// vera per il confronto con lo scenario liquidatorio (vedi
// confrontoLiquidatorio.ts) — non la Relazione, che legge quel dato
// già pronto. Più lento di una chiamata AI pura, il default implicito
// non basta più a garantire margine.
export const maxDuration = 180;

export default async function BrogliaccioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  const scenarioRis = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!scenarioRis.success || !scenarioRis.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }

  if (scenarioRis.scenario!.tipoProposta !== 'RICEVUTA') {
    return (
      <BrogliaccioRedigenteScenario
        nomeSchema={contesto.nomeSchema}
        scenarioId={Number(scenarioId)}
      />
    );
  }

  const plusRis = await ottieniFunzioniPlusSpazio(contesto.nomeSchema);

  return (
    <BrogliaccioEnteScenario
      nomeSchema={contesto.nomeSchema}
      scenarioId={Number(scenarioId)}
      plusDatiSettore={plusRis.funzioni.datiSettore}
      plusSimulazione={plusRis.funzioni.simulazione}
    />
  );
}
