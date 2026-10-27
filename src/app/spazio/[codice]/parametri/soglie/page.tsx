import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ParametriSoglieViewer } from '@/components/spazio/ParametriSoglieViewer';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

export default async function ParametriSogliePage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ ritorno?: string }>;
}) {
  const { codice } = await params;
  const { ritorno } = await searchParams;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-4">
      <LinkRitorno codice={codice} ritorno={ritorno} />
      <ParametriSoglieViewer nomeSchema={contesto.nomeSchema} />
    </main>
  );
}
