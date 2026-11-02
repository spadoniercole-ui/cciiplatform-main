import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { TlCatalogoManager } from '@/components/spazio/TlCatalogoManager';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

export default async function ParametriTlPage({
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
  if (contesto.modalita === 'OPERATORE' || contesto.tipoSpazio !== 'ENTE')
    redirect(`/spazio/${codice}`);

  return (
    <div className="max-w-4xl space-y-4">
      <LinkRitorno codice={codice} ritorno={ritorno} />
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <TlCatalogoManager nomeSchema={contesto.nomeSchema} codice={codice} ritorno={ritorno} />
      </div>
    </div>
  );
}
