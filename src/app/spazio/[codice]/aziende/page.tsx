import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { AziendeManager } from '@/components/spazio/AziendeManager';

export default async function AziendeSpazioPage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`); // Gestione dello spazio: mai a un Operatore/Consultatore

  return <AziendeManager nomeSchema={contesto.nomeSchema} codice={codice} />;
}
