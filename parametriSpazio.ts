import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { PropostaScenario } from '@/components/spazio/PropostaScenario';
import { DocumentiCorredoRedigente } from '@/components/spazio/DocumentiCorredoRedigente';

export default async function PropostaScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE' && (contesto.permessi?.report || 'NESSUNO') === 'NESSUNO') {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  const risultato = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!risultato.success || !risultato.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }
  const scenario = risultato.scenario!;

  return (
    <div className="space-y-10">
      <PropostaScenario
        nomeSchema={contesto.nomeSchema}
        scenarioId={Number(scenarioId)}
        aziendaId={scenario.aziendaId}
        tipoProposta={scenario.tipoProposta}
        tipoSpazio={contesto.tipoSpazio}
        nomeScenario={scenario.nome}
        rigaRilevanteBloccataIniziale={scenario.rigaRilevanteBloccata}
        codice={codice}
      />
      {/* Documenti di corredo: solo percorso Redigente — per una proposta
          ricevuta non si redige nulla, si valuta soltanto. */}
      {scenario.tipoProposta !== 'RICEVUTA' && (
        <DocumentiCorredoRedigente
          nomeSchema={contesto.nomeSchema}
          scenarioId={Number(scenarioId)}
        />
      )}
    </div>
  );
}
