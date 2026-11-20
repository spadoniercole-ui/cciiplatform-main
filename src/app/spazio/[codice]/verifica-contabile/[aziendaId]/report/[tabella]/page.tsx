import { notFound, redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import {
  proiezioneContabileAction,
  spiegazioniContabiliAction,
} from '@/app/actions/verificaContabile';
import {
  CHIAVI_TABELLE,
  componiTabelleReport,
  type ChiaveTabella,
} from '@/lib/contabile/reportContabile';
import { ReportContabile } from '@/components/spazio/ReportContabile';

export const dynamic = 'force-dynamic';

// IL REPORT DI UNA TABELLA — prospetto, differenziali o simulazione.
//
// Serve a portare a una riunione un foglio solo, con i valori di una tabella e
// la loro spiegazione. Stessa materia e stessa composizione del report unico:
// se i numeri cambiassero da una stampa all'altra, il documento non sarebbe una
// prova. Le note integrative restano nel report completo.
const SLUG: Record<string, ChiaveTabella> = {
  prospetto: 'PROSPETTO',
  differenziali: 'DIFFERENZIALI',
  simulazione: 'SIMULAZIONE',
};

export default async function ReportTabellaContabilePage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string; tabella: string }>;
}) {
  const { codice, aziendaId, tabella } = await params;
  const chiave = SLUG[tabella];
  if (!chiave) notFound();

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
    spiegazioniContabileSafe(contesto.nomeSchema, id),
  ]);

  const bilanci = (storicoRis?.success ? storicoRis.storico : [])
    .filter((b) => b.annoBilancio !== null)
    .map((b) => ({ anno: b.annoBilancio as number, dati: b.datiFinanziari }));

  const sezioni = componiTabelleReport({
    bilanci,
    proiezione: proiezioneRis?.success ? proiezioneRis.proiezione : null,
  }).filter((s) => s.scheda.chiave === chiave);

  if (sezioni.length !== 1 || !CHIAVI_TABELLE.includes(chiave)) notFound();

  return (
    <ReportContabile
      nomeSchema={contesto.nomeSchema}
      codice={codice}
      aziendaId={id}
      ragioneSociale={risultato.azienda.ragioneSociale}
      partitaIva={risultato.azienda.partitaIva ?? null}
      generatoIl={new Date().toLocaleDateString('it-IT')}
      sezioni={sezioni}
      note={[]}
      noteTroncate={false}
      annoNota={null}
      spiegazioniIniziali={spiegazioniRis}
      sola={chiave}
      conNote={false}
    />
  );
}

/** Le spiegazioni non sono la condizione del report: se non si leggono, il documento esce. */
async function spiegazioniContabileSafe(nomeSchema: string, aziendaId: number) {
  const r = await spiegazioniContabiliAction(nomeSchema, aziendaId).catch(() => null);
  return r?.success ? r.spiegazioni : {};
}
