import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';

export default async function ScenarioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  const risultato = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!risultato.success || !risultato.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }
  const scenario = risultato.scenario;

  // Un Operatore/Consultatore può vedere solo gli scenari delle aziende a
  // cui è stato associato dall'Admin di Spazio.
  if (
    contesto.modalita === 'OPERATORE' &&
    !contesto.aziendeConsentite?.includes(scenario.aziendaId)
  ) {
    redirect(`/spazio/${codice}/scenari`);
  }

  const base = `/spazio/${codice}/scenari/${scenarioId}`;

  return (
    <div className="max-w-5xl space-y-4">
      <Link
        href={`/spazio/${codice}/scenari`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna agli scenari
      </Link>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{scenario.nome}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {scenario.ragioneSocialeAzienda} —{' '}
              {scenario.tipoProposta === 'RICEVUTA'
                ? 'Proposta ricevuta da'
                : 'Proposta da definire —'}{' '}
              {scenario.origineProposta}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
            {scenario.stato}
          </span>
        </div>
      </div>

      {/* L'elenco completo delle 10 funzioni, con la spiegazione di
          ciascuna, vive solo nella Panoramica (page.tsx) — un solo posto
          di verità, non due esposizioni della stessa informazione.
          Da dentro un passo, questo link riporta lì. */}
      <Link
        href={base}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Torna alla Panoramica
      </Link>

      {children}
    </div>
  );
}
