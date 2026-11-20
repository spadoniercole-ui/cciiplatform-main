import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import {
  proiezioneContabileAction,
  spiegazioniContabiliAction,
} from '@/app/actions/verificaContabile';
import { componiTabelleReport, noteIntegrativeReport } from '@/lib/contabile/reportContabile';
import { ReportContabile } from '@/components/spazio/ReportContabile';

export const dynamic = 'force-dynamic';

// IL REPORT CONTABILE — un documento, non un rimando.
//
// Il report della verifica contabile mette insieme le tre tabelle che
// raccontano i numeri (prospetto depositato, differenziali, simulazione fino
// all'anno della verifica) con le note integrative del bilancio. Prima queste
// cose stavano in stampe diverse: chi leggeva doveva cercare altrove i numeri e
// fidarsi che fossero gli stessi. Ogni tabella porta la sua spiegazione, e il
// documento si stampa così com'è.
export default async function ReportContabilePage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-contabile`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/verifica-contabile`);
  }

  const [storicoRis, proiezioneRis, spiegazioniRis] = await Promise.all([
    ottieniStoricoXbrlAzienda(contesto.nomeSchema, id).catch(() => null),
    proiezioneContabileAction(contesto.nomeSchema, id).catch(() => null),
    spiegazioniContabiliAction(contesto.nomeSchema, id).catch(() => null),
  ]);

  const storico = storicoRis?.success ? storicoRis.storico : [];
  const bilanci = storico
    .filter((b) => b.annoBilancio !== null)
    .map((b) => ({ anno: b.annoBilancio as number, dati: b.datiFinanziari }));

  // Le note si leggono dall'ultimo bilancio che le porta: sono il testo con cui
  // l'azienda spiega i numeri che il documento mostra.
  const conNote = [...storico].reverse().find((b) => (b.noteFatti?.length ?? 0) > 0);
  const note = noteIntegrativeReport(conNote?.noteFatti ?? null);

  const sezioni = componiTabelleReport({
    bilanci,
    proiezione: proiezioneRis?.success ? proiezioneRis.proiezione : null,
  });

  return (
    <ReportContabile
      nomeSchema={contesto.nomeSchema}
      codice={codice}
      aziendaId={id}
      ragioneSociale={risultato.azienda.ragioneSociale}
      partitaIva={risultato.azienda.partitaIva ?? null}
      generatoIl={new Date().toLocaleDateString('it-IT')}
      sezioni={sezioni}
      note={note.note}
      noteTroncate={note.troncate}
      annoNota={conNote?.annoBilancio ?? null}
      spiegazioniIniziali={spiegazioniRis?.success ? spiegazioniRis.spiegazioni : {}}
    />
  );
}
