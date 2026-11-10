import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniConfigVerificaAziendaAction } from '@/app/actions/verificaAzienda';
import { VerificaAziendaScheda } from '@/components/spazio/VerificaAziendaScheda';

export const dynamic = 'force-dynamic';

export default async function VerificaAziendaSchedaPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const id = Number(aziendaId);
  if (!Number.isInteger(id) || id <= 0) redirect(`/spazio/${codice}/verifica-azienda`);

  const risultato = await ottieniAziendaPerId(contesto.nomeSchema, id);
  if (!risultato.success || !risultato.azienda) {
    redirect(`/spazio/${codice}/verifica-azienda`);
  }

  const config = await ottieniConfigVerificaAziendaAction(contesto.nomeSchema);

  return (
    <VerificaAziendaScheda
      nomeSchema={contesto.nomeSchema}
      aziendaId={id}
      ragioneSociale={risultato.azienda.ragioneSociale}
      annualitaIniziale={config.success ? config.annualita : 3}
    />
  );
}
