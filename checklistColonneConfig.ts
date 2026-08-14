import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ScreeningAziendaScenario } from '@/components/spazio/ScreeningAziendaScenario';

// Due chiamate AI in parallelo (questionario + relazione), ciascuna con
// timeout di 150s (vedi screeningAzienda.ts) — margine sopra quello,
// non il default implicito della piattaforma.
export const maxDuration = 180;

// L'esistenza dell'azienda e i controlli di accesso di base sono già
// garantiti dal layout condiviso (layout.tsx in questa stessa cartella)
// — se questa pagina viene renderizzata, l'azienda esiste già. Non
// ripetuto qui per non duplicare la stessa query due volte.
export default async function ScreeningAziendaPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  return (
    <ScreeningAziendaScenario
      nomeSchema={contesto.nomeSchema}
      aziendaId={Number(aziendaId)}
      codice={codice}
      tipoSpazio={contesto.tipoSpazio}
    />
  );
}
