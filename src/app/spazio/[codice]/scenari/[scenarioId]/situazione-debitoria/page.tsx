import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { SituazioneDebitoriaScenario } from '@/components/spazio/SituazioneDebitoriaScenario';

export default async function SituazioneDebitoriaPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  const ris = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!ris.success || !ris.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <SituazioneDebitoriaScenario
        nomeSchema={contesto.nomeSchema}
        aziendaId={ris.scenario!.aziendaId}
        nomeAzienda={ris.scenario!.ragioneSocialeAzienda}
        scenarioId={Number(scenarioId)}
      />
    </main>
  );
}
