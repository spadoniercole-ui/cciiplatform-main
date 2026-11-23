import { redirect } from 'next/navigation';

// IL CARICAMENTO DEI BILANCI NON HA PIÙ UNA PAGINA SUA.
//
// Bilanci XBRL è la prima sezione della verifica contabile: lì il caricamento
// sta accanto a prospetto, indici e simulazione, cioè dove i file servono. Come
// scheda a sé era una pagina che si apriva solo da un vecchio segnalibro, con
// l'uscita «Torna alle aziende» che non c'entrava con ciò che si stava facendo.
//
// L'indirizzo resta vivo e porta lì: chi aveva il segnalibro trova il
// caricamento, non un 404.
export default async function AziendaBilanciPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  redirect(`/spazio/${codice}/verifica-contabile/${aziendaId}#bilanci-xbrl`);
}
