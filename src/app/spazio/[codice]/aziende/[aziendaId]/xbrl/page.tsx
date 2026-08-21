import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { AziendaConfigXbrl } from '@/components/spazio/AziendaConfigXbrl';
import { SottoNavAnalisiBilancio } from '@/components/spazio/SottoNavAnalisiBilancio';

export default async function AziendaXbrlPage({
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
    <div className="space-y-4">
      <SottoNavAnalisiBilancio base={`/spazio/${codice}/aziende/${aziendaId}`} attivo="xbrl" />
      <AziendaConfigXbrl nomeSchema={contesto.nomeSchema} aziendaId={Number(aziendaId)} />
    </div>
  );
}
