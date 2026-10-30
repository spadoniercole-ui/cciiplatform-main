import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { AziendaBilanciXbrl } from '@/components/spazio/AziendaBilanciXbrl';
import { SottoNavAnalisiBilancio } from '@/components/spazio/SottoNavAnalisiBilancio';

export default async function AziendaBilanciPage({
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

  const base = `/spazio/${codice}/aziende/${aziendaId}`;

  return (
    <div className="space-y-4">
      <SottoNavAnalisiBilancio base={base} attivo="bilanci" />
      <AziendaBilanciXbrl
        nomeSchema={contesto.nomeSchema}
        aziendaId={Number(aziendaId)}
        hrefConfigurazione={`${base}/xbrl`}
      />
    </div>
  );
}
