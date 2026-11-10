import { redirect } from 'next/navigation';

// LA POSIZIONE ENTE VIVE NELL'ESITO AMMINISTRATIVO (0.194.0).
//
// Certificazione dei debiti e soglie di segnalazione sono il risultato della
// verifica amministrativa: stavano qui, nella scheda azienda, raggiungibili
// anche dalla contabile. Ora la rotta non ha più una pagina propria: porta
// all'esito, dove i dati nascono. Il vecchio indirizzo resta valido per i
// collegamenti e i segnalibri già esistenti.

export default async function PosizioneEnteAziendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
  searchParams: Promise<{ scheda?: string }>;
}) {
  const { codice, aziendaId } = await params;
  const { scheda } = await searchParams;
  const query = scheda ? `?scheda=${encodeURIComponent(scheda)}` : '';
  redirect(`/spazio/${codice}/verifica-salute/${aziendaId}${query}`);
}
