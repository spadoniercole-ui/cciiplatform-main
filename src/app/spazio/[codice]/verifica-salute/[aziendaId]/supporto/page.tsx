import { redirect } from 'next/navigation';

// Il report non è più una pagina del Pannello Spazio (0.215.0): vive in una
// rotta autonoma, senza guscio, impaginata come un documento. Questo indirizzo
// resta come ingresso storico e porta lì, conservando la richiesta di stampa.
export default async function ReportSupportoRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
  searchParams: Promise<{ stampa?: string }>;
}) {
  const { codice, aziendaId } = await params;
  const { stampa } = await searchParams;
  const coda = stampa === '1' ? '?stampa=1' : '';
  redirect(`/report/verifica-amministrativa/${codice}/${aziendaId}${coda}`);
}
