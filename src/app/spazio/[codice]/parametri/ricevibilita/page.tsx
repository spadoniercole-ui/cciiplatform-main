import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { RicevibilitaManager } from '@/components/spazio/RicevibilitaManager';
import { PercentualeMediaPropostaManager } from '@/components/spazio/PercentualeMediaPropostaManager';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

export default async function ParametriRicevibilitaPage({
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
    <div className="max-w-4xl space-y-4">
      <LinkRitorno codice={codice} ritorno={ritorno} />
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        {contesto.tipoSpazio === 'ENTE' ? (
          <RicevibilitaManager nomeSchema={contesto.nomeSchema} tipoSpazio={contesto.tipoSpazio} />
        ) : (
          <PercentualeMediaPropostaManager nomeSchema={contesto.nomeSchema} />
        )}
      </div>
    </div>
  );
}
