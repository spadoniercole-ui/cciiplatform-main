import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ScenarioXbrlManager } from '@/components/spazio/ScenarioXbrlManager';
import { destinazioneRitorno } from '@/lib/ritorno';
import { BannerRitorno } from '@/components/spazio/BannerRitorno';

export default async function XbrlScenarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
  searchParams: Promise<{ ritorno?: string }>;
}) {
  const { codice, scenarioId } = await params;
  const rit = destinazioneRitorno(codice, scenarioId, (await searchParams).ritorno);
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
    <div className="space-y-4">
      {rit && <BannerRitorno ritorno={rit} />}
      <ScenarioXbrlManager
        nomeSchema={contesto.nomeSchema}
        aziendaId={risultato.scenario!.aziendaId}
        scenarioId={Number(scenarioId)}
      />
    </div>
  );
}
