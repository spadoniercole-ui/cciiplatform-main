import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { ScenariManager } from '@/components/spazio/ScenariManager';

export default async function ScenariPage({ params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  // La demo può essere già attiva da una versione precedente: prima di
  // mostrare l'elenco si riallineano i soli percorsi, così i titoli e i tipi
  // seguono le tre direzioni e compare la quarta valutazione aperta. I
  // parametri modificati dall'utente non vengono toccati.
  if (contesto.demo) {
    const { caricaPercorsoDemoEnte } = await import('@/lib/demo/caricaPercorsoEnte');
    await caricaPercorsoDemoEnte(contesto.nomeSchema, { soloPercorsi: true }).catch((errore) => {
      console.error('[ScenariPage] Riallineamento demo non riuscito:', errore);
    });
  }

  return (
    <ScenariManager
      codiceSpazio={codice}
      nomeSchema={contesto.nomeSchema}
      aziendeConsentite={contesto.modalita === 'OPERATORE' ? contesto.aziendeConsentite : undefined}
      tipoSpazio={contesto.tipoSpazio}
    />
  );
}
