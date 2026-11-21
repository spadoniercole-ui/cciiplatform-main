import { redirect } from 'next/navigation';

// IL DOCUMENTO DELLA CONTABILE HA UN NOME SOLO: IL REPORT CONTABILE.
//
// Questo percorso era la vecchia «fotografia contabile», una seconda stampa
// degli stessi numeri: il report contabile l'ha assorbita e si apre da lì. Il
// percorso resta solo per non spezzare i segnalibri già salvati; non rende
// nessun documento, così non ci sono due nomi per la stessa cosa.

export const dynamic = 'force-dynamic';

export default async function FotografiaContabileRedirect({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  redirect(`/spazio/${codice}/verifica-contabile/${aziendaId}/report`);
}
