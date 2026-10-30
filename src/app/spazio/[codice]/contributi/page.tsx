import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { elencoContributiPerAnnoSpazioAction } from '@/app/actions/soglie25novies';
import { VistaContributiSpazio } from '@/components/spazio/VistaContributiSpazio';
import { riepilogoVistaContributi, vistaContributiSpazio } from '@/lib/soglie25novies/vistaSpazio';

// Vista d'insieme dello spazio: quali aziende hanno un rapporto contributi in
// crescita, e quanto del loro debito è scaduto da oltre 90 giorni. È una
// lettura: la serie si forma nel triage o con il ricalcolo d'ufficio, non
// aprendo questa pagina.

export default async function ContributiSpazioPage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  // Dati di tutte le aziende dello spazio: come la gestione aziende, mai a un
  // Operatore (che vede solo le posizioni assegnate).
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const esito = await elencoContributiPerAnnoSpazioAction(contesto.nomeSchema);
  const righe = esito.success ? vistaContributiSpazio(esito.righe ?? []) : [];

  return (
    <VistaContributiSpazio
      codice={codice}
      righe={righe}
      riepilogo={riepilogoVistaContributi(righe)}
      senzaSerie={esito.senzaSerie ?? 0}
      errore={esito.success ? null : (esito.error ?? 'Lettura non riuscita.')}
    />
  );
}
