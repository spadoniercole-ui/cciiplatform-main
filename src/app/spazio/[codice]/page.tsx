import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { ottieniContestoAccessoSpazio, ottieniAdminSpazio } from '@/app/actions/spazi';
import { ottieniAziende } from '@/app/actions/aziende';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { ottieniScenari } from '@/app/actions/scenari';
import { caricaPercorsoDemoEnte } from '@/lib/demo/caricaPercorsoEnte';
import {
  DashboardPannelli,
  type RigaScenario,
  type RigaVerificaDashboard,
} from '@/components/spazio/DashboardPannelli';

// Dashboard di Spazio (cruscotto): due pannelli, Triage e Scenari. Le aziende
// sono già dentro uno dei due elenchi; i report sono più d'uno anche intermedi,
// quindi «ultimo report» non è un'informazione affidabile da mettere qui.

export default async function DashboardSpazioPage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  // La demo già attiva non passa da «Crea spazio»: senza questo seed la
  // quinta azienda restava fuori dalle dashboard create prima della 0.174.6.
  // L'operazione è idempotente e tocca solo la posizione ferma al triage.
  if (contesto.demo) {
    try {
      await caricaPercorsoDemoEnte(contesto.nomeSchema, { soloTriage: true });
    } catch (errore) {
      console.error('[DashboardSpazioPage] seed del triage demo non riuscito', errore);
    }
  }

  const [risultatoAdmin, risultatoAziende, verificheRis] = await Promise.all([
    ottieniAdminSpazio(contesto.nomeSchema),
    ottieniAziende(contesto.nomeSchema),
    ottieniStoricoVerificheAction(contesto.nomeSchema),
  ]);

  // Scenari: elenco reale (con nome azienda) + conteggio totale.
  let totaleScenari: number | '—' = '—';
  let righeScenari: RigaScenario[] = [];
  if (risultatoAziende.success) {
    const perAzienda = await Promise.all(
      risultatoAziende.aziende.map(async (a) => ({
        azienda: a,
        ris: await ottieniScenari(contesto.nomeSchema, a.id),
      }))
    );
    totaleScenari = perAzienda.reduce(
      (acc, x) => acc + (x.ris.success ? x.ris.scenari.length : 0),
      0
    );
    righeScenari = perAzienda
      .flatMap((x) =>
        (x.ris.success ? x.ris.scenari : []).map((s) => ({
          id: s.id,
          nome: s.nome,
          aziendaRagioneSociale: x.azienda.ragioneSociale,
          createdAt: s.createdAt,
        }))
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(({ id, nome, aziendaRagioneSociale }) => ({ id, nome, aziendaRagioneSociale }));
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard di Spazio</h1>
        <p className="text-slate-500 text-xs mt-1">{contesto.descrizione}</p>
      </div>

      {(!risultatoAdmin.success || !risultatoAziende.success) && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {risultatoAdmin.error || risultatoAziende.error}
        </div>
      )}

      <DashboardPannelli
        codice={codice}
        verifiche={
          verificheRis.success && verificheRis.righe
            ? verificheRis.righe.map((v: RigaVerificaDashboard) => ({
                id: v.id,
                ragioneSociale: v.ragioneSociale,
                partitaIva: v.partitaIva,
                esito: v.esito,
                presaInCarico: v.presaInCarico,
                archiviata: v.archiviata,
              }))
            : []
        }
        scenari={righeScenari}
        totaleScenari={totaleScenari}
      />
    </div>
  );
}
