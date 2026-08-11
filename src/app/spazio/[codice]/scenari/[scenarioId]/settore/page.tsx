import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';
import { DatiSettoreScenario } from '@/components/spazio/DatiSettoreScenario';
import { FunzionePlusNonAbilitata } from '@/components/spazio/FunzionePlusNonAbilitata';

export default async function DatiSettorePage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  const risultato = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!risultato.success || !risultato.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }
  const scenario = risultato.scenario!;

  const plusRis = await ottieniFunzioniPlusSpazio(contesto.nomeSchema);
  if (!plusRis.funzioni.datiSettore) {
    return <FunzionePlusNonAbilitata nomeFunzione="Dati di Settore" />;
  }

  return <DatiSettoreScenario nomeSchema={contesto.nomeSchema} aziendaId={scenario.aziendaId} />;
}
