import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ProdottiEnteManager } from '@/components/spazio/ProdottiEnteManager';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

// BLOCCO 2 DELLA CATENA (0.161.0): i prodotti, il flag per la check list e le
// domande che il triage porrà. Sta dopo le direttrici perché un prodotto senza
// area non si configura, e prima delle TS perché la TS si associa al prodotto.
export default async function ParametriProdottiPage({
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
        <ProdottiEnteManager nomeSchema={contesto.nomeSchema} codice={codice} ritorno={ritorno} />
      </div>
    </div>
  );
}
