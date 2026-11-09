// PRIMO PASSO DI OGNI SCENARIO — LE VERIFICHE DELL’ENTE.
//
// Uno scenario non riparte dai documenti: parte da ciò che l’ente ha già
// verificato su quell’azienda (certificazione dei debiti del triage e
// Posizione Debitoria dell’Ente). L’elenco è filtrato sull’azienda dello
// scenario — non su tutte — e dice quando una verifica manca, invece di
// lasciare che il percorso cominci come se il punto di partenza fosse zero.
//
// Le verifiche non si copiano dentro lo scenario: si leggono dalla posizione
// dell’azienda, così un dato aggiornato vale subito e non resta fermo in una
// fotografia.

import Link from 'next/link';
import { ChevronRight, ClipboardCheck, FileWarning } from 'lucide-react';
import { sintesiVerificheEnte, type RiepilogoVerificheEnte } from '@/lib/debitiEnte/verificheEnte';

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

export function VerificheEnteScenario({
  riepilogo,
  codice,
  aziendaId,
  ragioneSociale,
}: {
  riepilogo: RiepilogoVerificheEnte;
  codice: string;
  aziendaId: number;
  ragioneSociale: string;
}) {
  const vuoto = riepilogo.presenti === 0;
  const hrefVerifica = `/spazio/${codice}/verifica-salute?azienda=${aziendaId}`;
  const hrefPosizione = `/spazio/${codice}/aziende/${aziendaId}/posizione-ente`;

  return (
    <section
      className={`rounded-xl border p-4 ${
        vuoto ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            0 · Primo passo
          </p>
          <h2 className="mt-0.5 text-sm font-bold text-slate-900 flex items-center gap-2">
            {vuoto ? (
              <FileWarning className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <ClipboardCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            )}
            Verifiche dell’ente — {ragioneSociale}
          </h2>
          <p className="mt-1 text-[11px] text-slate-700 max-w-3xl leading-relaxed">
            {sintesiVerificheEnte(riepilogo)} L’elenco è filtrato su questa azienda: sono le
            verifiche che l’ente ha già fatto su di lei, non su altre.
          </p>
        </div>
        <Link
          href={hrefVerifica}
          className={`shrink-0 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
            vuoto
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {vuoto ? 'Carica le verifiche' : 'Apri la verifica'}
        </Link>
      </div>

      {!vuoto && (
        <ul className="mt-3 divide-y divide-emerald-100 border-t border-emerald-100">
          {riepilogo.voci.map((v) => (
            <li
              key={v.codice}
              className="py-2 flex items-center justify-between gap-3 flex-wrap text-[11px]"
            >
              <span className="min-w-0">
                <span className="font-bold text-slate-800">{v.etichetta}</span>
                <span className="text-slate-500">
                  {' '}
                  · {v.righe} {v.righe === 1 ? 'posizione' : 'posizioni'} · {v.dettaglio}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums font-bold text-slate-900">{euro(v.totale)}</span>
                <Link
                  href={v.codice === 'CERTIFICAZIONE' ? hrefVerifica : hrefPosizione}
                  className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:text-blue-700"
                >
                  Apri <ChevronRight className="w-3 h-3" />
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
        Le verifiche non si ricaricano dentro lo scenario: lo scenario le legge dalla posizione
        dell’azienda, così un dato aggiornato vale subito e non resta fermo in una copia.
      </p>
    </section>
  );
}
