import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniVisuraTriageAction } from '@/app/actions/visuraTriage';
import { ottieniAnagraficaEnte } from '@/app/actions/anagraficaEnte';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { VerificaContabileAzienda } from '@/components/spazio/VerificaContabileAzienda';

export const dynamic = 'force-dynamic';

export default async function VerificaContabileAziendaPage({
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

  const [visuraRis, parametriRis, storicoRis] = await Promise.all([
    ottieniVisuraTriageAction(contesto.nomeSchema, id),
    ottieniAnagraficaEnte(contesto.nomeSchema, id),
    ottieniStoricoXbrlAzienda(contesto.nomeSchema, id),
  ]);

  const visura = visuraRis.success && visuraRis.visura ? visuraRis.visura : null;

  return (
    <VerificaContabileAzienda
      nomeSchema={contesto.nomeSchema}
      codice={codice}
      aziendaId={id}
      ragioneSociale={risultato.azienda.ragioneSociale}
      visuraIniziale={
        visura ? { nome: visura.nome, caricataIl: visura.caricataIl.slice(0, 10) } : null
      }
      parametriIniziali={parametriRis.success ? parametriRis.dati : ({} as never)}
      anniXbrl={
        storicoRis.success ? storicoRis.storico.filter((b) => b.annoBilancio !== null).length : 0
      }
    />
  );
}
