import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { elencoContributiPerAnnoSpazioAction } from '@/app/actions/soglie25novies';
import { VistaContributiSpazio } from '@/components/spazio/VistaContributiSpazio';
import {
  FILTRI_VISTA,
  filtraVistaContributi,
  filtroVistaDaParam,
  riepilogoVistaContributi,
  vistaContributiSpazio,
  type FiltroVista,
} from '@/lib/soglie25novies/vistaSpazio';

// Vista d'insieme dello spazio: quali aziende hanno un rapporto contributi in
// crescita, e quanto del loro debito è scaduto da oltre 90 giorni. È una
// lettura: la serie si forma nel triage o con il ricalcolo d'ufficio, non
// aprendo questa pagina.
//
// Il filtro sta nell'URL e non nello stato del browser: la pagina resta un
// Server Component, il link si può mandare a un collega, e ricaricarla non
// riporta all'elenco intero.

export default async function ContributiSpazioPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ filtro?: string | string[] }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  // Dati di tutte le aziende dello spazio: come la gestione aziende, mai a un
  // Operatore (che vede solo le posizioni assegnate).
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const esito = await elencoContributiPerAnnoSpazioAction(contesto.nomeSchema);
  const tutte = esito.success ? vistaContributiSpazio(esito.righe ?? []) : [];

  const { filtro: parametro } = await searchParams;
  const filtro = filtroVistaDaParam(parametro);
  const righe = filtraVistaContributi(tutte, filtro);

  // I numeri accanto alle pastiglie si contano sulle righe intere: un filtro
  // che mostra «3» perché ha già escluso il resto non direbbe quante aziende
  // restano scegliendolo.
  const conteggi = Object.fromEntries(
    FILTRI_VISTA.map((f) => [f.valore, filtraVistaContributi(tutte, f.valore).length])
  ) as Record<FiltroVista, number>;

  return (
    <VistaContributiSpazio
      codice={codice}
      righe={righe}
      riepilogo={riepilogoVistaContributi(tutte)}
      senzaSerie={esito.senzaSerie ?? 0}
      errore={esito.success ? null : (esito.error ?? 'Lettura non riuscita.')}
      filtro={filtro}
      conteggi={conteggi}
      totaleAziende={tutte.length}
    />
  );
}
