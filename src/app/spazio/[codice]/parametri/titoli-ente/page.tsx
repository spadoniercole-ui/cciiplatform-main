import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { TitoliEnteManager } from '@/components/spazio/TitoliEnteManager';
import { LinkRitorno } from '@/components/spazio/LinkRitorno';

// La ricerca sulle fonti ufficiali parte dopo il salvataggio (after()): le
// serve il tempo della funzione, non quello della risposta. Senza questo
// tetto la ricerca verrebbe interrotta a metà e la riga resterebbe «in
// verifica» — con il pulsante «Riprendi», ma senza motivo di usarlo.
export const maxDuration = 120;

export default async function ParametriTitoliEntePage({
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
        <TitoliEnteManager nomeSchema={contesto.nomeSchema} codice={codice} ritorno={ritorno} />
      </div>
    </div>
  );
}
