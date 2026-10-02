import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { TabellaIndiciPeriodi } from '@/components/spazio/TabellaIndiciPeriodi';

export default async function IndiciScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE' && (contesto.permessi?.indici || 'NESSUNO') === 'NESSUNO') {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  // Tabella unica (righe = indici, colonne = periodi): più leggibile delle
  // schede una per indice, e identica a quella di Analisi Bilancio.
  return (
    <TabellaIndiciPeriodi
      nomeSchema={contesto.nomeSchema}
      scenarioId={Number(scenarioId)}
      titolo="Indici per periodo, con la Posizione aggiornata"
    />
  );
}
