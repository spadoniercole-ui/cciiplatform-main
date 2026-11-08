import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { PianoPonte } from '@/components/spazio/PianoPonte';

export const maxDuration = 60;

export default async function PianoPontePage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);
  if (contesto.tipoSpazio !== 'ENTE') redirect(`/spazio/${codice}/aziende/${aziendaId}`);

  return (
    <PianoPonte nomeSchema={contesto.nomeSchema} aziendaId={Number(aziendaId)} codice={codice} />
  );
}
