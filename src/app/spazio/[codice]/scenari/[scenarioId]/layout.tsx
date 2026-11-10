import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniDebitiVera } from '@/app/actions/posizioneVera';
import { ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { riepilogoVerificheEnte } from '@/lib/debitiEnte/verificheEnte';
import { VerificheEnteScenario } from '@/components/spazio/VerificheEnteScenario';
import { verificheDisponibiliAziendaAction } from '@/app/actions/verificheScenario';
import { AGGANGIO_VUOTO } from '@/lib/debitiEnte/aggancioContabile';
import { leggiRiferimentoAzienda } from '@/lib/anagraficaEnte/identificativi';
import { IdentificativiEnte } from '@/components/spazio/IdentificativiEnte';
import { RiferimentoAziendaStampa } from '@/components/spazio/RiferimentoAziendaStampa';
import { SituazioneScenario } from '@/components/spazio/SituazioneScenario';
import { leggiPassiCompilati } from '@/lib/scenari/passiCompilati';
import { passiDaRivedere } from '@/lib/scenari/situazione';
import { leggiStoricoSituazione } from '@/lib/scenari/storicoSituazione';
import { leggiStoricoSblocchi } from '@/lib/scenari/storicoSblocchi';
import { DemoAziendaScope } from '@/components/spazio/DemoUploadProvider';

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

  // La demo può essere già attiva da una versione precedente. Il riallineamento
  // non può dipendere dall'aver aperto Scenari: chi arriva da un collegamento
  // diretto allo scenario deve vedere subito il percorso aggiornato (per
  // esempio Tessitura come liquidazione, non più come proposta).
  if (contesto.demo) {
    const { caricaPercorsoDemoEnte } = await import('@/lib/demo/caricaPercorsoEnte');
    await caricaPercorsoDemoEnte(contesto.nomeSchema, { soloPercorsi: true }).catch((errore) => {
      console.error('[ScenarioLayout] Riallineamento demo non riuscito:', errore);
    });
  }

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

  // PRIMO PASSO DI OGNI SCENARIO: le verifiche che l’ente ha già fatto su
  // questa azienda. Sta nel layout perché vale per tutti i tipi di scenario
  // (Redigente, Ricevente, decreto, cram down), non solo per uno.
  const [vera, posizione] = await Promise.all([
    ottieniDebitiVera(contesto.nomeSchema, scenario.aziendaId).catch(() => null),
    ottieniDebitiEnte(contesto.nomeSchema, scenario.aziendaId).catch(() => null),
  ]);
  const verifiche = riepilogoVerificheEnte({
    righeVera: vera && vera.success ? vera.righe : [],
    documentiCaricatiIl: vera && vera.success ? (vera.documentiCaricatiIl ?? null) : null,
    righePosizione: posizione && posizione.success ? posizione.righe : [],
  });

  // Che cosa esiste davvero su questa azienda: decide quali spunte sono
  // possibili nel passo 0 (l'amministrativa è obbligatoria, la contabile no).
  const disponibilita = await verificheDisponibiliAziendaAction(
    contesto.nomeSchema,
    scenario.aziendaId
  ).catch(() => null);

  // Dopo un cambio di situazione i passi compilati non sono spariti: si dice
  // che cosa va ricontrollato, con i numeri veri letti adesso.
  const passiScenario = scenario.situazioneCambiataIl
    ? passiDaRivedere(
        await leggiPassiCompilati(contesto.nomeSchema, scenario.id).catch(() => ({
          propostaRighe: 0,
          risposteChecklist: 0,
        }))
      )
    : [];

  // L'annullamento dell'ultimo cambio è riservato all'Admin di Spazio (il
  // server lo impone comunque: qui serve solo a non mostrare un comando inutile).
  const puoAnnullareSituazione =
    contesto.modalita === 'ADMIN_SPAZIO' || contesto.modalita === 'SALVAGENTE';

  const storicoSituazione = scenario.situazioneCambiataIl
    ? await leggiStoricoSituazione(contesto.nomeSchema, scenario.id).catch(() => [])
    : [];

  // Gli sblocchi restano visibili anche dopo: sono la traccia di chi ha
  // rimesso lo scenario in lavorazione, e perché.
  const sblocchiScenario = await leggiStoricoSblocchi(contesto.nomeSchema, scenario.id, 5).catch(
    () => []
  );

  const base = `/spazio/${codice}/scenari/${scenarioId}`;
  // Testata dell'azienda: identificativi presso l'ente in evidenza.
  const riferimento = await leggiRiferimentoAzienda(contesto.nomeSchema, scenario.aziendaId).catch(
    () => null
  );

  return (
    <DemoAziendaScope azienda={scenario.ragioneSocialeAzienda}>
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
                {scenario.ragioneSocialeAzienda} · origine: {scenario.origineProposta}
              </p>
              <SituazioneScenario
                nomeSchema={contesto.nomeSchema}
                scenarioId={scenario.id}
                situazione={scenario.tipoIstruttoria ?? 'PROPOSTA'}
                origine={scenario.origineProposta}
                bloccato={Boolean(scenario.bloccatoIl)}
                demo={contesto.demo}
                cambiataIl={scenario.situazioneCambiataIl}
                rivedere={passiScenario}
                storico={storicoSituazione}
                sblocchi={sblocchiScenario}
                codice={codice}
                puoAnnullare={puoAnnullareSituazione}
              />
              {riferimento && (
                <p className="mt-1">
                  <IdentificativiEnte
                    identificativi={riferimento.identificativi}
                    partitaIva={riferimento.partitaIva}
                    codiceFiscale={riferimento.codiceFiscale}
                    compatto
                  />
                </p>
              )}
              {riferimento && <RiferimentoAziendaStampa {...riferimento} />}
            </div>
            <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
              {scenario.stato}
            </span>
          </div>
        </div>

        <VerificheEnteScenario
          riepilogo={verifiche}
          codice={codice}
          aziendaId={scenario.aziendaId}
          nomeSchema={contesto.nomeSchema}
          scenarioId={scenario.id}
          ragioneSociale={scenario.ragioneSocialeAzienda}
          verifiche={{
            amministrativa: scenario.verificaAmministrativa,
            contabile: scenario.verificaContabile,
            amministrativaIl: scenario.verificaAmministrativaIl,
            contabileIl: scenario.verificaContabileIl,
          }}
          disponibilita={{
            amministrativa: Boolean(disponibilita?.success && disponibilita.amministrativa),
            contabile: Boolean(disponibilita?.success && disponibilita.contabile),
            aggancio:
              disponibilita?.success && disponibilita.aggancio
                ? disponibilita.aggancio
                : AGGANGIO_VUOTO,
          }}
        />

        {/* Il ramo contabile per anno sta accanto al percorso principale:
            dal bilancio XBRL depositato alla simulazione, senza uscire dallo
            scenario. */}
        <Link
          href={`${base}/contabile`}
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 transition-colors"
        >
          <span>
            <span className="block text-xs font-bold text-slate-900">Ramo contabile per anno</span>
            <span className="block text-[10px] text-slate-500 mt-0.5">
              Ogni bilancio XBRL apre il suo ramo; sul ramo si lanciano le simulazioni, con indici e
              valutazione ricalcolati.
            </span>
          </span>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-blue-700">
            Apri
          </span>
        </Link>

        {/* Lo scenario si lavora su una pagina sola: da ogni pagina di
          servizio questo link riporta lì. */}
        <Link
          href={`${base}/proposta`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors"
        >
          <LayoutGrid className="w-3.5 h-3.5" />{' '}
          {scenario.tipoProposta === 'RICEVUTA'
            ? 'Torna all’istruttoria'
            : 'Torna alla lavorazione'}
        </Link>

        {children}
      </div>
    </DemoAziendaScope>
  );
}
