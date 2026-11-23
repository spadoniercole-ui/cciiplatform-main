import { redirect } from 'next/navigation';

// LA CHECK LIST E IL TEST PRATICO SI COMPILANO NELLO SCENARIO.
//
// Questa pagina aveva una copia propria delle 56 domande, scritta su un
// archivio aziendale che nessun conteggio leggeva: la lavorazione della
// proposta conta infatti le risposte dello scenario, cioè quelle della Check
// List dello scenario — e in più questa pagina era l'unica porta (mai
// dichiarata nella scheda) del Test pratico, con l'uscita «Torna alle aziende»
// che non c'entrava.
//
// Ora il Test pratico apre la Check List dello scenario e le domande sono una
// sola volta. L'indirizzo resta vivo come rimando: con lo scenario nel
// collegamento porta alla sua Check List, altrimenti alla verifica
// amministrativa dell'azienda (il triage, dove una lettura d'insieme ha senso).
export default async function CheckListAziendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
  searchParams: Promise<{ ritorno?: string; scenario?: string }>;
}) {
  const { codice, aziendaId } = await params;
  const { ritorno, scenario } = await searchParams;
  if (scenario && /^\d+$/.test(scenario)) {
    // Solo i ritorni noti: l'URL non si costruisce con quello che arriva.
    const rit = ritorno === 'lavorazione' || ritorno === 'valutazione' ? `?ritorno=${ritorno}` : '';
    redirect(`/spazio/${codice}/scenari/${scenario}/checklist${rit}`);
  }
  redirect(`/spazio/${codice}/verifica-salute?azienda=${aziendaId}`);
}
