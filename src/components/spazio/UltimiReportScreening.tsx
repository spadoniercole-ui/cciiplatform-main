'use client';

import Link from 'next/link';
import { FileText, Printer } from 'lucide-react';
import { stampaTesto } from '@/lib/stampaTesto';
import type { UltimoScreeningSpazio } from '@/app/actions/screeningAzienda';

interface Props {
  codice: string;
  screening: UltimoScreeningSpazio[];
}

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/**
 * Elenco dashboard degli ultimi report di Screening: una riga per azienda
 * (la rigenerazione sovrascrive, quindi qui c'e sempre e solo l'ultimo).
 * A sinistra i riferimenti aziendali, all'estrema destra il PDF dell'ultimo
 * screening con la data di generazione. Il PDF e la stampa nativa del
 * browser (Salva come PDF) della relazione salvata.
 */
export function UltimiReportScreening({ codice, screening }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-slate-500" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Ultimi report di Screening
        </h2>
      </div>

      {screening.length === 0 ? (
        <p className="text-xs text-slate-400">
          Nessun report di Screening generato finora. Vai su un&apos;azienda → Screening per
          generarne uno.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {screening.map((s) => {
            const riferimento = s.partitaIva
              ? `P.IVA ${s.partitaIva}`
              : s.codiceFiscale
                ? `C.F. ${s.codiceFiscale}`
                : null;
            return (
              <div key={s.aziendaId} className="flex items-center justify-between gap-3 py-3">
                <Link
                  href={`/spazio/${codice}/aziende/${s.aziendaId}/screening`}
                  className="min-w-0 group"
                >
                  <div className="font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors truncate">
                    {s.ragioneSociale}
                  </div>
                  {riferimento && (
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{riferimento}</div>
                  )}
                </Link>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-slate-400 whitespace-nowrap text-right">
                    {fmtData(s.generatoIl)}
                  </span>
                  {s.relazioneTesto ? (
                    <button
                      type="button"
                      onClick={() =>
                        stampaTesto(
                          `Screening — ${s.ragioneSociale}`,
                          s.relazioneTesto!,
                          s.generatoIl
                        )
                      }
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[9px] uppercase rounded transition-colors whitespace-nowrap"
                      title="Apre la stampa dell'ultimo screening — da lì puoi salvare come PDF"
                    >
                      <Printer className="w-3 h-3" /> PDF
                    </button>
                  ) : (
                    <span className="text-[9px] text-slate-300 uppercase font-bold px-2.5 py-1.5">
                      no PDF
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-slate-400 mt-3">
        Solo l&apos;ultimo report per azienda: rigenerare lo Screening sovrascrive il precedente.
      </p>
    </div>
  );
}
