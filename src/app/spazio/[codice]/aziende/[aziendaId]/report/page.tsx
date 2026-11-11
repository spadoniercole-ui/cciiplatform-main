import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ReportAzienda } from '@/components/spazio/ReportAzienda';

// La rigenerazione dell'analisi passa dallo screening (due chiamate AI in
// parallelo): lo stesso margine della pagina della valutazione completa.
export const maxDuration = 180;
export const dynamic = 'force-dynamic';

export default async function ReportAziendaPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/report`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!risultato.success || !risultato.azienda) redirect(`/spazio/${codice}/report`);

  return (
    <div className="space-y-3">
      <Link
        href={`/spazio/${codice}/verifica-azienda/${id}`}
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-3 h-3" /> Verifica azienda
      </Link>
      <ReportAzienda
        nomeSchema={contesto.nomeSchema}
        aziendaId={id}
        ragioneSociale={risultato.azienda.ragioneSociale}
        codice={codice}
      />
    </div>
  );
}
