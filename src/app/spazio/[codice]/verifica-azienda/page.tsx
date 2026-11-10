import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';
import { MemorizzaDebitoEnte } from '@/components/spazio/MemorizzaDebitoEnte';

export const dynamic = 'force-dynamic';

export default async function VerificaAziendaPage({
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
        <h1 className="text-xl font-bold text-slate-900">Verifica azienda</h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
          Le due verifiche lette insieme: il dato storico della contabile e il debito certo
          dell’amministrativa. Scegli l’azienda per aprire la mappa con le proiezioni.
        </p>
      </div>

      {!stato.success && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {stato.error ?? 'Impossibile leggere lo stato delle verifiche.'}
        </p>
      )}

      {stato.success && stato.aziende.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Nessuna azienda attiva: nascono dalla verifica amministrativa.
        </p>
      )}

      <div className="space-y-2">
        {stato.aziende.map((a) => (
          <div
            key={a.aziendaId}
            className="flex items-start gap-2 bg-white border border-slate-200 rounded-xl hover:border-blue-300 transition-colors"
          >
            <Link
              href={`/spazio/${codice}/verifica-azienda/${a.aziendaId}`}
              className="block flex-1 min-w-0 p-4 hover:bg-blue-50/30 rounded-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">{a.ragioneSociale}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        a.debitoMemorizzato !== null
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {a.debitoMemorizzato !== null
                        ? `Debito ente ${Math.round(a.debitoMemorizzato).toLocaleString('it-IT')} €`
                        : 'Debito ente da memorizzare'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        a.anniXbrl > 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {a.anniXbrl > 0 ? `${a.anniXbrl} annualità XBRL` : 'Bilanci da caricare'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        a.completa ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {a.completa ? 'Contabile completa' : 'Contabile da completare'}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 px-2 py-1 rounded bg-slate-900 text-white text-[9px] font-bold uppercase tracking-wider">
                  Apri la mappa
                </span>
              </div>
            </Link>
            {a.debitoMemorizzato === null && (
              <div className="shrink-0 p-4 pl-0">
                <MemorizzaDebitoEnte nomeSchema={contesto.nomeSchema} aziendaId={a.aziendaId} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
