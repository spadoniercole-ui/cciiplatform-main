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

  // Due strumenti diversi, non una variante dello stesso: chi redige
  // aggiusta leve fino a un equilibrio (resta qui). Chi riceve legge
  // criticamente i documenti allegati contro i dati già raccolti — quel
  // pezzo vive dentro Proposta ora, non più qui: lo stepper Ricevente
  // non ha più questo passo, redirect per chi arriva comunque
  // sull'URL diretto.
  if (scenarioRis.scenario!.tipoProposta === 'DA_DEFINIRE') {
    return (
      <SimulazioneRedigenteScenario
        nomeSchema={contesto.nomeSchema}
        scenarioId={Number(scenarioId)}
      />
    );
  }

  redirect(`/spazio/${codice}/scenari/${scenarioId}/proposta`);
}
