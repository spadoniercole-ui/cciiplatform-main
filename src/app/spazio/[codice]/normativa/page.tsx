import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { NormativaBrowser } from '@/components/spazio/NormativaBrowser';

// Sezione Normativa CCII: consultabile da ogni utente dello spazio (nessun
// permesso specifico richiesto). Supporta il deep-link dai report tramite
// ?art=<numero> e ?voce=<termine>, cosi il collegamento contestuale apre
// direttamente l'articolo o la voce di glossario pertinente.

export default async function NormativaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ art?: string; voce?: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  const { art, voce } = await searchParams;

  return <NormativaBrowser articoloIniziale={art} voceIniziale={voce} />;
}
