import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrendingUp } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';

// GLI STUDI DI SETTORE (0.213.0).
//
// La simulazione della verifica azienda parte dalla crescita storica e arriva
// a quella di settore. Senza vedere la serie da cui quel tasso esce, il numero
// sembra preso a caso: questa voce di menu mostra, per l'azienda scelta, la
// serie ISTAT del suo gruppo ATECO e la traiettoria che la simulazione ne
// ricava. È lettura del dato, non una previsione.

export const dynamic = 'force-dynamic';

export default async function StudiSettorePage({
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
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" /> Studi di settore
        </h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
          L’andamento del settore dell’azienda, così come lo legge la simulazione: la serie ISTAT
          del gruppo ATECO, la crescita che ne deriva e il peso che ha sui ricavi e sui costi
          proiettati. Serve a vedere da dove vengono i tassi, non a produrre una previsione.
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
          <Link
            key={a.aziendaId}
            href={`/spazio/${codice}/studi-settore/${a.aziendaId}`}
            className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">{a.ragioneSociale}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {a.anniXbrl > 0
                  ? `${a.anniXbrl} annualità di bilancio in archivio`
                  : 'Nessun bilancio in archivio'}
              </p>
            </div>
            <span className="shrink-0 px-2 py-1 rounded bg-slate-900 text-white text-[9px] font-bold uppercase tracking-wider">
              Andamento del settore
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
