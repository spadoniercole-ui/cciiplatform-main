import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ParametriSpazioManager } from '@/components/spazio/ParametriSpazioManager';

export default async function ParametriSpazioPage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`); // Gestione dello spazio: mai a un Operatore/Consultatore

  return (
    <ParametriSpazioManager
      nomeSchema={contesto.nomeSchema}
      codice={codice}
      tipoSpazio={contesto.tipoSpazio}
    />
  );
}
