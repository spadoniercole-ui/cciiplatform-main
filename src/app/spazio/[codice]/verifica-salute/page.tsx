import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { VerificaSaluteAzienda } from '@/components/spazio/VerificaSaluteAzienda';

// L'estrazione dalla visura è una chiamata al modello su un PDF: il tetto di
// durata predefinito non basta.
export const maxDuration = 180;

export default async function VerificaSalutePage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <VerificaSaluteAzienda nomeSchema={contesto.nomeSchema} codice={codice} />
    </main>
  );
}
