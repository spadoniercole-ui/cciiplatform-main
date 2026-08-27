import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { PosizioneEnteScenario } from '@/components/spazio/PosizioneEnteScenario';

// Raggiungibile direttamente da Azienda, non solo passando per uno
// Scenario — i dati vivono qui (Anagrafica Ente e Situazione
// Debitoria non cambiano da una proposta all'altra della stessa
// azienda), quindi anche il punto di accesso deve stare qui, non
// nascosto dietro il percorso di un singolo scenario.
export default async function PosizioneEnteAziendaPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  // Aperta a ENTRAMBI i percorsi, con contenuti diversi.
  //
  // ENTE: Anagrafica Ente, Situazione Debitoria, Posizione V.E.R.A. e Soglie
  // di segnalazione — l'ente dichiara cio' che sa dell'impresa.
  //
  // NON_ENTE: la sola scheda Soglie di segnalazione. Il professionista quei
  // valori li ha: o ha richiesto il file V.E.R.A. all'istituto, o li ricava
  // dai flussi UNIEMENS inviati, da cui prende il totale annuo. Le altre tre
  // schede restano fuori, perche' un redigente non ha un ente che dichiara
  // qualcosa su di se'.

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, Number(aziendaId));
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/aziende`);
  }

  return (
    <PosizioneEnteScenario
      nomeSchema={contesto.nomeSchema}
      aziendaId={Number(aziendaId)}
      nomeAzienda={risultato.azienda!.ragioneSociale}
      tipoSpazio={contesto.tipoSpazio}
    />
  );
}
