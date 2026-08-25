import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { ottieniContestoAccessoSpazio, ottieniAdminSpazio } from '@/app/actions/spazi';
import { ottieniAziende } from '@/app/actions/aziende';
import { ottieniScenari } from '@/app/actions/scenari';
import { ottieniUltimiScreeningSpazio } from '@/app/actions/screeningAzienda';
import {
  DashboardPannelli,
  type RigaAzienda,
  type RigaUtente,
  type RigaScenario,
} from '@/components/spazio/DashboardPannelli';

// Dashboard di Spazio (cruscotto): quattro pannelli larghi, ciascuno con le
// prime righe della propria attività (aziende, utenti, scenari, ultimi report
// di screening con PDF). Niente più conteggi "nudi" o box separati: ogni
// riquadro mostra il conteggio in alto e sotto le prime 4 voci reali.

export default async function DashboardSpazioPage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');

  const [risultatoAdmin, risultatoAziende] = await Promise.all([
    ottieniAdminSpazio(contesto.nomeSchema),
    ottieniAziende(contesto.nomeSchema),
  ]);

  const aziendeAttive = risultatoAziende.aziende.filter((a) => a.attiva).length;

  // Aziende: attive prima, poi le altre; riferimenti anagrafici inclusi.
  const aziendeOrdinaTe = [...risultatoAziende.aziende].sort(
    (a, b) => Number(b.attiva) - Number(a.attiva)
  );
  const righeAziende: RigaAzienda[] = aziendeOrdinaTe.map((a) => ({
    id: a.id,
    ragioneSociale: a.ragioneSociale,
    partitaIva: a.partitaIva,
    codiceFiscale: a.codiceFiscale,
    attiva: a.attiva,
  }));

  const righeUtenti: RigaUtente[] = risultatoAdmin.success
    ? risultatoAdmin.admins.map((u) => ({
        nome: u.nome,
        cognome: u.cognome,
        username: u.username ?? null,
        email: u.email ?? null,
      }))
    : [];

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

  // Ultimo report di Screening per azienda (uno solo per azienda: la
  // rigenerazione sovrascrive, quindi qui c'è sempre e solo l'ultimo).
  const screeningRis = await ottieniUltimiScreeningSpazio(contesto.nomeSchema);
  const ultimiScreening = screeningRis.success ? screeningRis.screening : [];

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
        aziende={righeAziende}
        totaleAziendeAttive={risultatoAziende.success ? aziendeAttive : '—'}
        utenti={righeUtenti}
        totaleUtenti={risultatoAdmin.success ? risultatoAdmin.admins.length : '—'}
        scenari={righeScenari}
        totaleScenari={totaleScenari}
        report={ultimiScreening}
      />
    </div>
  );
}
