import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ParametriSoglieViewer } from '@/components/spazio/ParametriSoglieViewer';

export default async function ParametriSogliePage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <ParametriSoglieViewer nomeSchema={contesto.nomeSchema} />
    </main>
  );
}
