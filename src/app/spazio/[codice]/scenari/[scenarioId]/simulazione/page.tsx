import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';
import { PianoSviluppoScenario } from '@/components/spazio/PianoSviluppoScenario';
import { FunzionePlusNonAbilitata } from '@/components/spazio/FunzionePlusNonAbilitata';

export default async function SimulazioneScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (
    contesto.modalita === 'OPERATORE' &&
    (contesto.permessi?.simulazione || 'NESSUNO') === 'NESSUNO'
  ) {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  const plusRis = await ottieniFunzioniPlusSpazio(contesto.nomeSchema);
  if (!plusRis.funzioni.simulazione) {
    return <FunzionePlusNonAbilitata nomeFunzione="Piano di sviluppo" />;
  }

  const scenarioRis = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!scenarioRis.success || !scenarioRis.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }

  // Il piano di sviluppo (e, per il Ricevente, il confronto con il piano
  // dell'azienda) è sempre disponibile per
  // il Redigente (DA_DEFINIRE). Per il Ricevente (RICEVUTA) compare solo se lo
  // scenario è stato creato con il flag "simulazione attiva". Chi arriva
  // sull'URL diretto senza i requisiti viene rimandato alla Panoramica.
  const scenario = scenarioRis.scenario!;
  const simulazioneDisponibile =
    scenario.tipoProposta === 'DA_DEFINIRE' ||
    (scenario.tipoProposta === 'RICEVUTA' && scenario.simulazioneAttiva);

  if (simulazioneDisponibile) {
    return (
      <PianoSviluppoScenario
        nomeSchema={contesto.nomeSchema}
        codice={codice}
        scenarioId={Number(scenarioId)}
        aziendaId={scenario.aziendaId}
        tipoProposta={scenario.tipoProposta === 'RICEVUTA' ? 'RICEVUTA' : 'DA_DEFINIRE'}
      />
    );
  }

  // SENZA IL FLAG, IL PIANO NON SI APRE — E SI DICE PERCHÉ (0.256.11).
  //
  // Il flag «simulazione» dichiara su che cosa poggia la valutazione: senza,
  // l'unico dato è quello contabile che arriva dal passo 3 della verifica
  // azienda, e su quello vanno fatte le considerazioni del caso. Un piano di
  // sviluppo è un dato che l'azienda non ha ancora presentato: aprirlo qui
  // significherebbe valutare su numeri che non esistono. Il rimando secco alla
  // panoramica lasciava credere a un guasto; questa pagina dice il motivo e
  // dove si lavora.
  return (
    <div className="max-w-2xl space-y-3">
      <Link
        href={`/spazio/${codice}/scenari/${scenarioId}`}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Torna allo scenario
      </Link>
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-700">
          <SlidersHorizontal className="h-4 w-4 text-blue-600" /> Piano di sviluppo non disponibile
        </p>
        <p className="text-[12px] leading-relaxed text-slate-700">
          Questo scenario è stato creato senza il flag di simulazione: il sistema non vi lavora su
          un eventuale piano. Senza quel flag l’unico dato su cui orientare una valutazione è quello
          contabile che arriva dal passo 3 della verifica azienda — il prospetto dell’azienda — e su
          quello vanno fatte le considerazioni del caso.
        </p>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Il piano si apre quando lo scenario è stato messo alla prova dalla verifica aziendale, che
          lo attiva esplicitamente. Fino ad allora il percorso resta quello delle verifiche: prima i
          dati, poi la valutazione.
        </p>
      </div>
    </div>
  );
}
