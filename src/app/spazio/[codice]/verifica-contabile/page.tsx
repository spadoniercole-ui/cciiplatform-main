import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';

export const dynamic = 'force-dynamic';

export default async function VerificaContabilePage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const stato = await statoVerificaContabileAction(contesto.nomeSchema);

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Verifica contabile aziendale</h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
          Visura storica, parametri dell’ente, bilanci XBRL e prospetto a scalare con gli indici: il
          dato storico dell’azienda, acquisito una volta e disponibile a tutto il resto. La
          certificazione dei debiti non si chiede qui — è il dato della verifica amministrativa.
        </p>
      </div>

      {!stato.success && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {stato.error ?? 'Impossibile leggere lo stato delle verifiche.'}
        </p>
      )}

      {stato.success && stato.aziende.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Nessuna azienda attiva. Le aziende nascono dalla verifica amministrativa.
        </p>
      )}

      <div className="space-y-2">
        {stato.aziende.map((a) => (
          <Link
            key={a.aziendaId}
            href={`/spazio/${codice}/verifica-contabile/${a.aziendaId}`}
            className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900">{a.ragioneSociale}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {a.partitaIva
                    ? `P.IVA ${a.partitaIva}`
                    : (a.codiceFiscale ?? 'identificativi mancanti')}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      a.visuraPresente
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {a.visuraPresente ? `Visura ${a.visuraIl ?? ''}` : 'Visura da acquisire'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      a.parametriPresenti
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {a.parametriPresenti ? 'Parametri ente' : 'Parametri da compilare'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      a.anniXbrl > 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {a.anniXbrl > 0
                      ? `${a.anniXbrl} ${a.anniXbrl === 1 ? 'annualità XBRL' : 'annualità XBRL'}`
                      : 'Bilanci da caricare'}
                  </span>
                </div>
              </div>
              <span
                className={`shrink-0 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${
                  a.completa ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
                }`}
              >
                {a.completa ? 'Completa' : 'Apri la verifica'}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
