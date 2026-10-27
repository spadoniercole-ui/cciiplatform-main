import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { LavorazioniTipoDebitoManager } from '@/components/spazio/LavorazioniTipoDebitoManager';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

export default async function ParametriLavorazioniPage({
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
    <div className="max-w-5xl space-y-4">
      <LinkRitorno codice={codice} ritorno={ritorno} />
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <LavorazioniTipoDebitoManager
          nomeSchema={contesto.nomeSchema}
          codice={codice}
          ritorno={ritorno}
        />
      </div>
    </div>
  );
}
