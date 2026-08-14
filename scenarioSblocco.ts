import { redirect } from 'next/navigation';

// "Report" è stato rinominato "Proposta" (etichetta meno ambigua: questa
// pagina acquisisce la proposta e ne verifica la ricevibilità, non genera
// report). La Relazione AI è ora un passo a sé su /relazione. Redirect
// invece di rompere eventuali link salvati.
export default async function ReportScenarioPageRedirect({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  redirect(`/spazio/${codice}/scenari/${scenarioId}/proposta`);
}
