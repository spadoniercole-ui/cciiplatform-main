import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { CheckListAziendaScenario } from '@/components/spazio/CheckListAziendaScenario';
import { CheckListMinisterialeAziendaScenario } from '@/components/spazio/CheckListMinisterialeAziendaScenario';
import { TestPraticoAziendaScenario } from '@/components/spazio/TestPraticoAziendaScenario';

export default async function CheckListAziendaPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  if (contesto.tipoSpazio !== 'ENTE') {
    // Redigente: il Test pratico (Sezione I) fa da premessa alla Check
    // List Ministeriale (Sezione II) — stessa pagina, nell'ordine del
    // documento ufficiale.
    return (
      <div className="space-y-8">
        <TestPraticoAziendaScenario
          nomeSchema={contesto.nomeSchema}
          aziendaId={Number(aziendaId)}
        />
        <CheckListMinisterialeAziendaScenario
          nomeSchema={contesto.nomeSchema}
          aziendaId={Number(aziendaId)}
        />
      </div>
    );
  }

  return (
    <CheckListAziendaScenario
      nomeSchema={contesto.nomeSchema}
      aziendaId={Number(aziendaId)}
      codice={codice}
    />
  );
}
