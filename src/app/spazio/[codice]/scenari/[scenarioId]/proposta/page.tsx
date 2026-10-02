import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { PropostaScenario } from '@/components/spazio/PropostaScenario';
import { DocumentiCorredoRedigente } from '@/components/spazio/DocumentiCorredoRedigente';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';

// L'analisi dei documenti della proposta (Ricevente) è l'operazione AI più
// pesante di questo flusso — due chiamate in parallelo su più PDF. Senza un
// tetto esplicito la funzione serverless usa il default (breve) e viene uccisa
// a metà (spinner infinito). Le altre pagine AI (brogliaccio 180, relazione
// 120) hanno già il proprio; qui mancava.
export const maxDuration = 300;

export default async function PropostaScenarioPage({
  params,
}: {
  params: Promise<{ codice: string; scenarioId: string }>;
}) {
  const { codice, scenarioId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE' && (contesto.permessi?.report || 'NESSUNO') === 'NESSUNO') {
    redirect(`/spazio/${codice}/scenari/${scenarioId}`);
  }

  const risultato = await ottieniScenarioPerId(contesto.nomeSchema, Number(scenarioId));
  if (!risultato.success || !risultato.scenario) {
    redirect(`/spazio/${codice}/scenari`);
  }
  const scenario = risultato.scenario!;
  // Percorso Ricevente: piano e Relazione si chiudono su questa stessa pagina.
  const plus =
    scenario.tipoProposta === 'RICEVUTA'
      ? await ottieniFunzioniPlusSpazio(contesto.nomeSchema)
      : null;
  const permesso = (m: string) =>
    contesto.modalita !== 'OPERATORE' ||
    ((contesto.permessi as Record<string, string> | undefined)?.[m] ?? 'NESSUNO') !== 'NESSUNO';
  const chiusura =
    scenario.tipoProposta === 'RICEVUTA' && plus
      ? {
          simulazioneAttiva: scenario.simulazioneAttiva,
          pianoDisponibile: plus.funzioni.simulazione && permesso('simulazione'),
          relazioneDisponibile: plus.funzioni.relazioneAi && permesso('relazione'),
          eAdminSpazio: contesto.modalita === 'ADMIN_SPAZIO' || contesto.modalita === 'SALVAGENTE',
          identitaUtente:
            contesto.email ||
            (contesto.modalita === 'SALVAGENTE' ? 'Superadmin (salvagente)' : null),
          bloccatoIl: scenario.bloccatoIl,
        }
      : undefined;

  return (
    <div className="space-y-10">
      <PropostaScenario
        nomeSchema={contesto.nomeSchema}
        scenarioId={Number(scenarioId)}
        aziendaId={scenario.aziendaId}
        tipoProposta={scenario.tipoProposta}
        tipoSpazio={contesto.tipoSpazio}
        nomeScenario={scenario.nome}
        rigaRilevanteBloccataIniziale={scenario.rigaRilevanteBloccata}
        codice={codice}
        chiusura={chiusura}
      />
      {/* Documenti di corredo: solo percorso Redigente — per una proposta
          ricevuta non si redige nulla, si valuta soltanto. */}
      {scenario.tipoProposta !== 'RICEVUTA' && (
        <DocumentiCorredoRedigente
          nomeSchema={contesto.nomeSchema}
          scenarioId={Number(scenarioId)}
          aziendaId={scenario.aziendaId}
        />
      )}
    </div>
  );
}
