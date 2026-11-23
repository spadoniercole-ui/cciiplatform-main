import { redirect } from 'next/navigation';

// GLI INDICI DI UN'AZIENDA NON SONO UNA PAGINA A SÉ.
//
// Scegliere quali indici leggere e quali tab del bilancio alimentare è la
// stessa decisione: che cosa del bilancio depositato si guarda. Le due schede
// stavano in fila sotto «Analisi Bilancio», ma solo la configurazione XBRL
// aveva una porta (il rimando dentro il caricamento dei bilanci); questa no.
// Ora la scelta degli indici sta nella configurazione XBRL e l'indirizzo
// vecchio porta lì.
export default async function AziendaIndiciPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  redirect(`/spazio/${codice}/aziende/${aziendaId}/xbrl`);
}
