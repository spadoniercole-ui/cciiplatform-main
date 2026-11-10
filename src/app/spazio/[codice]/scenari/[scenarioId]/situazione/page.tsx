import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, History, Unlock } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { leggiStoricoSituazione } from '@/lib/scenari/storicoSituazione';
import { leggiStoricoSblocchi } from '@/lib/scenari/storicoSblocchi';
import { dataItaliana } from '@/lib/scenari/situazione';
import { etichettaIstruttoria, type TipoIstruttoria } from '@/lib/giudice/lettura';

// LA CRONOLOGIA COMPLETA (0.193.0).
//
// La scheda dello scenario mostra le ultime voci; qui ci sono tutte, senza
// limite pratico, insieme agli sblocchi con motivo e autore. È la traccia che
// si consulta quando si deve ricostruire che cosa è successo e chi lo ha
// fatto, senza aprire il database.

export default async function CronologiaSituazionePage({
  params,
}: {
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

  const [storico, sblocchi] = await Promise.all([
    leggiStoricoSituazione(contesto.nomeSchema, scenario.id, 200).catch(() => []),
    leggiStoricoSblocchi(contesto.nomeSchema, scenario.id, 200).catch(() => []),
  ]);

  return (
    <div className="space-y-4">
      <Link
        href={`/spazio/${codice}/scenari/${scenarioId}/proposta`}
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna allo scenario
      </Link>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-lg font-bold text-slate-900">Cronologia della situazione</h1>
        <p className="text-xs text-slate-500 mt-1">
          {scenario.ragioneSocialeAzienda} · situazione attuale:{' '}
          <span className="font-bold text-slate-700">
            {etichettaIstruttoria((scenario.tipoIstruttoria as TipoIstruttoria) ?? 'PROPOSTA')}
          </span>
        </p>
        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
          Ogni cambio e ogni annullamento restano scritti: la cronologia non si cancella. Gli
          sblocchi sono elencati sotto, con il motivo dichiarato da chi li ha fatti.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-slate-400" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Cambi di situazione ({storico.length})
          </h2>
        </div>
        {storico.length === 0 ? (
          <p className="text-xs text-slate-400">
            Nessun cambio registrato: la situazione è quella scelta alla creazione.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {storico.map((voce, i) => (
              <li key={`${voce.cambiataIl}-${i}`} className="py-2 text-xs text-slate-700">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">
                    {dataItaliana(voce.cambiataIl)} — da{' '}
                    {etichettaIstruttoria(voce.da as TipoIstruttoria | null)} a{' '}
                    {etichettaIstruttoria(voce.a as TipoIstruttoria)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    {voce.autore ?? 'autore non registrato'}
                  </span>
                </div>
                {voce.annullatoIl && (
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Annullato il {dataItaliana(voce.annullatoIl)}
                    {voce.annullatoDa ? ` da ${voce.annullatoDa}` : ''}.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Unlock className="w-4 h-4 text-slate-400" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Sblocchi dello scenario ({sblocchi.length})
          </h2>
        </div>
        {sblocchi.length === 0 ? (
          <p className="text-xs text-slate-400">Nessuno sblocco registrato.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sblocchi.map((voce, i) => (
              <li key={`${voce.sbloccatoIl}-${i}`} className="py-2 text-xs text-slate-700">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{dataItaliana(voce.sbloccatoIl)}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    {voce.sbloccatoDa ?? 'autore non registrato'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">{voce.motivo}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
