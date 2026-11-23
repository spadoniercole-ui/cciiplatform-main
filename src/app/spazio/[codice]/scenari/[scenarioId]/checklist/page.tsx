import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ChecklistScenario } from '@/components/spazio/ChecklistScenario';
import { TestPraticoAziendaScenario } from '@/components/spazio/TestPraticoAziendaScenario';
import { destinazioneRitorno } from '@/lib/ritorno';
import { BannerRitorno } from '@/components/spazio/BannerRitorno';

// LA CHECK LIST DELLO SCENARIO — e, per il Redigente, il Test pratico che la
// precede: Sezione I e Sezione II del documento guida, nello stesso ordine.
//
// Il Test pratico resta un dato dell'azienda (debito da ristrutturare / flussi
// annui a regime), ma si compila qui: è la premessa alle domande. Prima stava
// in una pagina aziendale senza porta, che scriveva anche una seconda copia
// delle 56 domande — copia che nessun conteggio leggeva, perché la lavorazione
// conta queste risposte.
export default async function CheckListScenarioPage({
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
  if (
    contesto.modalita === 'OPERATORE' &&
    (contesto.permessi?.checklist || 'NESSUNO') === 'NESSUNO'
  ) {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  // Il Test pratico è la premessa della lavorazione Redigente: chi riceve una
  // proposta non compila il decreto, quindi lì non si mostra.
  const scenarioRis = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  const scenario = scenarioRis.success ? scenarioRis.scenario : null;
  const redigente = Boolean(scenario && scenario.tipoProposta !== 'RICEVUTA');

  return (
    <div className="space-y-6">
      {rit && <BannerRitorno ritorno={rit} />}
      {redigente && scenario && (
        <TestPraticoAziendaScenario
          nomeSchema={contesto.nomeSchema}
          aziendaId={scenario.aziendaId}
        />
      )}
      <ChecklistScenario
        nomeSchema={contesto.nomeSchema}
        scenarioId={Number(scenarioId)}
        codice={codice}
      />
    </div>
  );
}
