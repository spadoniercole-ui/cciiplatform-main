import { redirect } from 'next/navigation';

// Lo scenario si lavora su una pagina sola, per entrambi i percorsi:
// l'istruttoria della proposta ricevuta (Ricevente) e la lavorazione della
// proposta (Redigente). Niente più panoramica di passi da percorrere uno per
// uno dalla sidebar.
export default async function ScenarioPanoramicaPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  redirect(`/spazio/${codice}/scenari/${scenarioId}/proposta`);
}
