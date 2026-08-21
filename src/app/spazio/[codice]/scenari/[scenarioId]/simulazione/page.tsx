import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';
import { SimulazioneRedigenteScenario } from '@/components/spazio/SimulazioneRedigenteScenario';
import { FunzionePlusNonAbilitata } from '@/components/spazio/FunzionePlusNonAbilitata';

export default async function SimulazioneScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (
    contesto.modalita === 'OPERATORE' &&
    (contesto.permessi?.simulazione || 'NESSUNO') === 'NESSUNO'
  ) {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  const plusRis = await ottieniFunzioniPlusSpazio(contesto.nomeSchema);
  if (!plusRis.funzioni.simulazione) {
    return <FunzionePlusNonAbilitata nomeFunzione="Simulazione" />;
  }

  const scenarioRis = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!scenarioRis.success || !scenarioRis.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }

  // Lo strumento a levette (sostenibilità del piano) è sempre disponibile per
  // il Redigente (DA_DEFINIRE). Per il Ricevente (RICEVUTA) compare solo se lo
  // scenario è stato creato con il flag "simulazione attiva". Chi arriva
  // sull'URL diretto senza i requisiti viene rimandato alla Panoramica.
  const scenario = scenarioRis.scenario!;
  const simulazioneDisponibile =
    scenario.tipoProposta === 'DA_DEFINIRE' ||
    (scenario.tipoProposta === 'RICEVUTA' && scenario.simulazioneAttiva);

  if (simulazioneDisponibile) {
    return (
      <SimulazioneRedigenteScenario
        nomeSchema={contesto.nomeSchema}
        scenarioId={Number(scenarioId)}
      />
    );
  }

  redirect(`/spazio/${codice}/scenari/${scenarioId}`);
}
