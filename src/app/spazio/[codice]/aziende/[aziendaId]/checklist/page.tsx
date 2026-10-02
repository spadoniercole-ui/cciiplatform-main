import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { CheckListAziendaScenario } from '@/components/spazio/CheckListAziendaScenario';
import { CheckListMinisterialeAziendaScenario } from '@/components/spazio/CheckListMinisterialeAziendaScenario';
import { TestPraticoAziendaScenario } from '@/components/spazio/TestPraticoAziendaScenario';
import { destinazioneRitorno } from '@/lib/ritorno';
import { BannerRitorno } from '@/components/spazio/BannerRitorno';

export default async function CheckListAziendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
  searchParams: Promise<{ ritorno?: string; scenario?: string }>;
}) {
  const { codice, aziendaId } = await params;
  const { ritorno, scenario } = await searchParams;
  // Aperta dalla lavorazione di uno scenario: si torna lì.
  const rit =
    scenario && /^\d+$/.test(scenario) ? destinazioneRitorno(codice, scenario, ritorno) : null;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  if (contesto.tipoSpazio !== 'ENTE') {
    // Redigente: il Test pratico (Sezione I) fa da premessa alla Check
    // List Ministeriale (Sezione II) — stessa pagina, nell'ordine del
    // documento ufficiale.
    return (
      <div className="space-y-8">
        {rit && <BannerRitorno ritorno={rit} />}
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
