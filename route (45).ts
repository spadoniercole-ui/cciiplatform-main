import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';
import { RelazioneAiScenario } from '@/components/spazio/RelazioneAiScenario';
import { FunzionePlusNonAbilitata } from '@/components/spazio/FunzionePlusNonAbilitata';

// La generazione della Relazione legge un confronto liquidatorio già
// pronto (generato a parte, a fine Brogliaccio) — non fa più ricerca
// web lei stessa, il default implicito basta di nuovo.
export const maxDuration = 120;

export default async function RelazioneScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (
    contesto.modalita === 'OPERATORE' &&
    (contesto.permessi?.relazione || 'NESSUNO') === 'NESSUNO'
  ) {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  const risultato = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!risultato.success || !risultato.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }

  const plusRis = await ottieniFunzioniPlusSpazio(contesto.nomeSchema);
  if (!plusRis.funzioni.relazioneAi) {
    return <FunzionePlusNonAbilitata nomeFunzione="Relazione AI" />;
  }

  return (
    <RelazioneAiScenario
      nomeSchema={contesto.nomeSchema}
      scenarioId={Number(scenarioId)}
      aziendaId={risultato.scenario!.aziendaId}
      tipoProposta={risultato.scenario!.tipoProposta}
      eAdminSpazio={contesto.modalita === 'ADMIN_SPAZIO' || contesto.modalita === 'SALVAGENTE'}
      identitaUtente={
        contesto.email || (contesto.modalita === 'SALVAGENTE' ? 'Superadmin (salvagente)' : null)
      }
      bloccatoIl={risultato.scenario!.bloccatoIl}
    />
  );
}
