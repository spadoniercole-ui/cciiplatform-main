import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { DirettriciEnteConfigManager } from '@/components/spazio/DirettriciEnteConfigManager';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

// BLOCCO 1 DELLA CATENA (0.161.0): qui si scrivono SOLO i nomi delle
// direttrici. I prodotti hanno un blocco proprio (`/parametri/prodotti`), con il
// flag per la check list e le domande; prima nascevano anche qui, e il nome
// dell'ufficio e il fatto concreto su cui si lavora finivano nella stessa
// schermata senza un ordine.
export default async function ParametriDirettriciEntePage({
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
        <DirettriciEnteConfigManager
          nomeSchema={contesto.nomeSchema}
          codice={codice}
          ritorno={ritorno}
        />
      </div>
    </div>
  );
}
