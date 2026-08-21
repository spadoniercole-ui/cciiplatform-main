import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniPropostaScenario } from '@/app/actions/propostaScenario';
import { ottieniRisposteChecklist } from '@/app/actions/checklist';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { ottienePosizioneAggiornata } from '@/app/actions/posizioneAggiornata';
import { passiScenario } from '@/lib/scenarioStepper';

export default async function ScenarioPanoramicaPage({
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
  const scenario = risultato.scenario!;

  // Stessi indicatori di completamento mostrati nello stepper: la
  // Panoramica e lo stepper sono la stessa informazione in due punti
  // diversi, non due fonti diverse.
  const [propostaRis, checklistRis, xbrlRis, debitiEnteRis, posizioneRis] = await Promise.all([
    ottieniPropostaScenario(contesto.nomeSchema, Number(scenarioId)),
    ottieniRisposteChecklist(contesto.nomeSchema, Number(scenarioId)),
    ottieniStoricoXbrlAzienda(contesto.nomeSchema, scenario.aziendaId),
    scenario.tipoProposta === 'RICEVUTA'
      ? ottieniDebitiEnte(contesto.nomeSchema, scenario.aziendaId)
      : Promise.resolve({ success: true, righe: [] as any[] }),
    ottienePosizioneAggiornata(contesto.nomeSchema, Number(scenarioId)),
  ]);
  const completato: Record<string, boolean> = {
    proposta: propostaRis.success && propostaRis.righe.length > 0,
    checklist: checklistRis.success && checklistRis.risposte.length > 0,
    xbrl: xbrlRis.success && xbrlRis.storico.length > 0,
    'posizione-ente': debitiEnteRis.success && debitiEnteRis.righe.length > 0,
    'posizione-aggiornata': posizioneRis.success && posizioneRis.esiste,
    indici:
      (xbrlRis.success && xbrlRis.storico.length > 0) ||
      (posizioneRis.success && posizioneRis.esiste),
  };

  const base = `/spazio/${codice}/scenari/${scenarioId}`;
  const passiVisibili = passiScenario(scenario.tipoProposta, scenario.simulazioneAttiva).filter(
    (passo) => {
      if (contesto.modalita !== 'OPERATORE') return true;
      if (!passo.modulo) return true;
      return (contesto.permessi?.[passo.modulo] || 'NESSUNO') !== 'NESSUNO';
    }
  );

  return (
    <div className="space-y-2">
      {scenario.bloccatoIl && (
        <div className="flex items-center gap-2 bg-slate-100 border border-slate-300 rounded-xl p-4 mb-2">
          <Check className="w-4 h-4 text-slate-500 shrink-0" />
          <p className="text-xs text-slate-700">
            <span className="font-bold">Sola lettura permanente</span> — la Relazione finale è stata
            generata il {new Date(scenario.bloccatoIl).toLocaleString('it-IT')}. Per una nuova
            valutazione, apri un nuovo scenario.
          </p>
        </div>
      )}
      {passiVisibili.map((passo) => {
        const presto = passo.stato === 'presto';
        const fatto = completato[passo.id];
        const Icon = passo.icon;
        return (
          <Link
            key={passo.id}
            href={`${base}/${passo.id}`}
            className="flex flex-col sm:flex-row gap-3 sm:gap-6 bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-3 sm:w-56 shrink-0">
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                  presto ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white'
                }`}
              >
                {passo.numero}
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <Icon className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-bold text-slate-900 text-sm">{passo.label}</span>
                </div>
                {fatto && !presto && (
                  <span className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase text-emerald-700">
                    <Check className="w-3 h-3" /> Fatto
                  </span>
                )}
                {presto && (
                  <span className="mt-1 inline-block text-[9px] font-bold uppercase text-slate-400">
                    Presto
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{passo.descrizione}</p>
          </Link>
        );
      })}
    </div>
  );
}
