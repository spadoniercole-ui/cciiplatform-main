import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ScenariManager } from '@/components/spazio/ScenariManager';

export default async function ScenariPage({ params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  return (
    <ScenariManager
      codiceSpazio={codice}
      nomeSchema={contesto.nomeSchema}
      aziendeConsentite={contesto.modalita === 'OPERATORE' ? contesto.aziendeConsentite : undefined}
      tipoSpazio={contesto.tipoSpazio}
    />
  );
}
