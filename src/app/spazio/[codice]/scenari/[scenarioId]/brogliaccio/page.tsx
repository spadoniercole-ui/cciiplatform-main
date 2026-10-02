import { redirect } from 'next/navigation';

// Il Brogliaccio non esiste più, in nessuno dei due percorsi: lo scenario si
// lavora su una pagina sola e la sintesi la compone la piattaforma quando
// serve (documenti di corredo, Relazione), senza un passo dell'utente.
export default async function BrogliaccioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  redirect(`/spazio/${codice}/scenari/${scenarioId}/proposta`);
}
