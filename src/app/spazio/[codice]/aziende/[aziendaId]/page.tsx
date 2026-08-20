import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { AziendaAnagraficaEditor } from '@/components/spazio/AziendaAnagraficaEditor';

export default async function AziendaAnagraficaPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, Number(aziendaId));
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/aziende`);
  }

  return (
    <AziendaAnagraficaEditor
      nomeSchema={contesto.nomeSchema}
      azienda={risultato.azienda!}
      codice={codice}
      tipoSpazio={contesto.tipoSpazio}
    />
  );
}
