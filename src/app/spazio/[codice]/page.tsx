import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, UserCog, FolderOpen, FileText, AlertTriangle } from 'lucide-react';
import { ottieniContestoAccessoSpazio, ottieniAdminSpazio } from '@/app/actions/spazi';
import { ottieniAziende } from '@/app/actions/aziende';
import { ottieniScenari } from '@/app/actions/scenari';
import { ottieniUltimiScreeningSpazio } from '@/app/actions/screeningAzienda';
import { UltimiReportScreening } from '@/components/spazio/UltimiReportScreening';

// Dashboard di Spazio (cruscotto): aziende attive, utenti/admin, check list
// e report — questi ultimi due ancora a zero perché i moduli non sono
// stati costruiti, non perché il conteggio sia sbagliato. Meglio uno zero
// onesto che un numero finto.

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

  let totaleScenari: number | '—' = '—';
  if (risultatoAziende.success) {
    const conteggi = await Promise.all(
      risultatoAziende.aziende.map((a) => ottieniScenari(contesto.nomeSchema, a.id))
    );
    totaleScenari = conteggi.reduce((acc, r) => acc + (r.success ? r.scenari.length : 0), 0);
  }

  // Ultimo report di Screening per azienda (uno solo per azienda: la
  // rigenerazione sovrascrive, quindi qui c'è sempre e solo l'ultimo).
  const screeningRis = await ottieniUltimiScreeningSpazio(contesto.nomeSchema);
  const ultimiScreening = screeningRis.success ? screeningRis.screening : [];

  const card = [
    {
      label: 'Aziende Attive',
      valore: risultatoAziende.success ? aziendeAttive : '—',
      icon: Building2,
      colore: 'text-blue-600 bg-blue-50',
      href: `/spazio/${codice}/aziende`,
    },
    {
      label: 'Utenti / Admin',
      valore: risultatoAdmin.success ? risultatoAdmin.admins.length : '—',
      icon: UserCog,
      colore: 'text-emerald-600 bg-emerald-50',
      href: `/spazio/${codice}/utenti`,
    },
    {
      label: 'Scenari',
      valore: totaleScenari,
      icon: FolderOpen,
      colore: 'text-blue-600 bg-blue-50',
      href: `/spazio/${codice}/scenari`,
    },
    {
      label: 'Ultimi Report',
      valore: ultimiScreening.length,
      icon: FileText,
      colore: 'text-blue-600 bg-blue-50',
      href: `/spazio/${codice}/aziende`,
    },
  ];

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {card.map((c) => {
          const contenuto = (
            <>
              <div className={`inline-flex p-2 rounded-lg ${c.colore} mb-2`}>
                <c.icon className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold text-slate-900">{c.valore}</div>
              <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                {c.label}
              </div>
            </>
          );

          return c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              {contenuto}
            </Link>
          ) : (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
              {contenuto}
            </div>
          );
        })}
      </div>

      <UltimiReportScreening codice={codice} screening={ultimiScreening} />
    </div>
  );
}
