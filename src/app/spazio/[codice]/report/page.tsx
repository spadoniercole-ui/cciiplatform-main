import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { elencoReportSpazioAction } from '@/app/actions/reportAzienda';

export const dynamic = 'force-dynamic';

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleString('it-IT') : null);

/**
 * REPORT — l'elenco delle aziende dello spazio, non cinque tipologie.
 *
 * Il report è uno: cambia che cosa include. Qui si vede per ogni azienda se è
 * stato emesso, quando, con quale versione, e in che stato sono le fonti che
 * lo alimentano. Il link porta al report dell'azienda, dove si sceglie che
 * cosa includere prima di generarlo.
 */
export default async function ReportSpazioPage({
  params,
}: {
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);
  if (!contesto) redirect('/');
  if (contesto.modalita === 'OPERATORE') redirect(`/spazio/${codice}`);

  const elenco = await elencoReportSpazioAction(contesto.nomeSchema);

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Report</h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
          Un documento per azienda, che tiene insieme l’esito della verifica amministrativa (in sola
          lettura), il dato della verifica contabile e l’analisi. Qui si vede che cosa è già stato
          emesso; si genera dalla scheda dell’azienda, scegliendo prima che cosa includere.
        </p>
      </div>

      {!elenco.success && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {elenco.error ?? 'Impossibile leggere l’elenco dei report.'}
        </p>
      )}

      {elenco.success && elenco.aziende.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Nessuna azienda attiva: nascono dalla verifica amministrativa.
        </p>
      )}

      <div className="space-y-2">
        {elenco.aziende.map((a) => (
          <Link
            key={a.aziendaId}
            href={`/spazio/${codice}/aziende/${a.aziendaId}/report`}
            className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  {a.ragioneSociale}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {a.ultimoReport
                    ? `Ultimo report: ${data(a.ultimoReport.generatoIl)}${
                        a.ultimoReport.versione ? ` · piattaforma ${a.ultimoReport.versione}` : ''
                      }`
                    : 'Nessun report emesso'}
                </p>
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
                {a.ultimoReport ? 'Apri il report' : 'Genera il report'}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
