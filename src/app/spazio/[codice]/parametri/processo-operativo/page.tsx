import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ProcessoOperativoManager } from '@/components/spazio/ProcessoOperativoManager';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

// BLOCCO 4 DELLA CATENA (0.161.0): il processo operativo per prodotto. Il
// prodotto porta con sé TS e direttrice, quindi qui si descrivono solo le
// attività. Il nome «materia» non compare più in questa pagina.
export default async function ParametriProcessoOperativoPage({
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
    <div className="max-w-5xl space-y-4">
      <LinkRitorno codice={codice} ritorno={ritorno} />
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <ProcessoOperativoManager
          nomeSchema={contesto.nomeSchema}
          codice={codice}
          ritorno={ritorno}
        />
      </div>
    </div>
  );
}
