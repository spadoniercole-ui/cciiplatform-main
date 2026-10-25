import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { VerificaSaluteAzienda } from '@/components/spazio/VerificaSaluteAzienda';

// L'estrazione dalla visura è una chiamata al modello su un PDF: il tetto di
// durata predefinito non basta.
export const maxDuration = 180;

export default async function VerificaSalutePage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ azienda?: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  // `?azienda=<id>` RIAPRE una verifica già eseguita: è la via di ritorno a
  // una videata che prima esisteva solo nella scheda del browser. Un id che non
  // è un intero positivo non si interpreta: si torna alla verifica da zero.
  const { azienda } = await searchParams;
  const id = Number(azienda);
  const aziendaDaRiprendere = Number.isInteger(id) && id > 0 ? id : null;

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <VerificaSaluteAzienda
        nomeSchema={contesto.nomeSchema}
        codice={codice}
        tipoSpazio={contesto.tipoSpazio}
        aziendaDaRiprendere={aziendaDaRiprendere}
      />
    </main>
  );
}
