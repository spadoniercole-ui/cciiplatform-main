import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniParametriScenariAction } from '@/app/actions/parametriScenari';
import { valutaSoglieAziendaAction } from '@/app/actions/soglie25novies';
import { leggiDebitoEnteMemorizzato } from '@/lib/debitiEnte/memorizzaDebitoEnte';
import { leggiSimulazioneBase } from '@/lib/verificaAzienda/baseSimulazione';
import { ottieniSovrascrittureAction } from '@/app/actions/confrontoScenario';
import { ConfrontoScenario } from '@/components/spazio/ConfrontoScenario';

export const dynamic = 'force-dynamic';

export default async function ConfrontoScenarioPage({
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

  if (
    contesto.modalita === 'OPERATORE' &&
    !contesto.aziendeConsentite?.includes(scenario.aziendaId)
  ) {
    redirect(`/spazio/${codice}/scenari`);
  }

  const base = `/spazio/${codice}/scenari/${scenario.id}`;

  if (!scenario.baseVerifica) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
          <p className="text-sm font-semibold text-slate-900">Questo scenario non ha una base</p>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-600">
            Il documento di confronto si costruisce da una base registrata alla creazione dello
            scenario: la simulazione dell’azienda per l’accordo transattivo, oppure la verifica
            amministrativa per liquidazione e cram down. Gli scenari creati prima di questa versione
            non ce l’hanno.
          </p>
          <Link
            href={`${base}/proposta`}
            className="mt-3 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
          >
            Torna allo scenario
          </Link>
        </div>
      </div>
    );
  }

  if (scenario.baseVerifica === 'AMMINISTRATIVA') {
    const [debito, parametri, soglie] = await Promise.all([
      leggiDebitoEnteMemorizzato(contesto.nomeSchema, scenario.aziendaId).catch(() => null),
      ottieniParametriScenariAction(contesto.nomeSchema).catch(() => null),
      valutaSoglieAziendaAction(contesto.nomeSchema, scenario.aziendaId, contesto.tipoSpazio).catch(
        () => null
      ),
    ]);

    return (
      <div className="space-y-4">
        <ConfrontoScenario
          modo="AMMINISTRATIVA"
          nomeSchema={contesto.nomeSchema}
          scenarioId={scenario.id}
          ragioneSociale={scenario.ragioneSocialeAzienda ?? 'Azienda'}
          nomeScenario={scenario.nome}
          credito={debito?.debito.totale ?? null}
          memorizzatoIl={debito?.memorizzatoIl ?? null}
          parametri={parametri?.success ? parametri.parametri : undefined}
          soglie={
            soglie?.success && soglie.esito
              ? {
                  superate: soglie.esito.superate.length,
                  nonDeterminabili: soglie.esito.nonDeterminabili.length,
                  datiMancanti: soglie.esito.datiMancanti,
                  ente: soglie.ente ?? null,
                }
              : null
          }
        />
        <Link
          href={`${base}/proposta`}
          className="inline-flex text-[11px] font-semibold text-slate-500 hover:text-blue-700"
        >
          ← Torna allo scenario
        </Link>
      </div>
    );
  }

  const [simulazione, sovrascritture] = await Promise.all([
    leggiSimulazioneBase(contesto.nomeSchema, scenario.aziendaId).catch(() => null),
    ottieniSovrascrittureAction(contesto.nomeSchema, scenario.id).catch(() => null),
  ]);

  return (
    <div className="space-y-4">
      <ConfrontoScenario
        modo="AZIENDALE"
        nomeSchema={contesto.nomeSchema}
        scenarioId={scenario.id}
        ragioneSociale={scenario.ragioneSocialeAzienda ?? 'Azienda'}
        nomeScenario={scenario.nome}
        base={
          simulazione
            ? {
                profilo: simulazione.profilo,
                annualita: simulazione.annualita,
                colonne: simulazione.colonne,
              }
            : null
        }
        sovrascritture={sovrascritture?.success ? (sovrascritture.sovrascritture ?? []) : []}
      />
      <Link
        href={`${base}/proposta`}
        className="inline-flex text-[11px] font-semibold text-slate-500 hover:text-blue-700"
      >
        ← Torna allo scenario
      </Link>
    </div>
  );
}
