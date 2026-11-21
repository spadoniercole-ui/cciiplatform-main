import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ritrattoAziendaAction } from '@/app/actions/ritratto';
import { RitrattoAzienda } from '@/components/spazio/RitrattoAzienda';

// Il ritratto legge le fonti a ogni apertura: non è un documento emesso, è
// una fotografia di ciò che la piattaforma sa adesso. Per questo non si salva.
export const dynamic = 'force-dynamic';

export default async function RitrattoAziendaPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/aziende`);

  const esito = await ritrattoAziendaAction(contesto.nomeSchema, id, contesto.tipoSpazio);

  return (
    <div className="space-y-3">
      <Link
        href={`/spazio/${codice}/aziende/${id}`}
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-3 h-3" /> Scheda azienda
      </Link>

      {esito.success && esito.ritratto ? (
        <RitrattoAzienda ritratto={esito.ritratto} />
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-bold text-red-800">Ritratto non disponibile</p>
          <p className="mt-1 text-[11px] text-red-700">
            {esito.error ?? 'Le fonti della posizione non sono leggibili in questo momento.'}
          </p>
        </div>
      )}
    </div>
  );
}
