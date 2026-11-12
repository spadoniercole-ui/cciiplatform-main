import Link from 'next/link';
import { History } from 'lucide-react';
import { etichettaIstruttoria, type TipoIstruttoria } from '@/lib/giudice/lettura';
import { dataItaliana } from '@/lib/scenari/situazione';

// LA NATURA DELLO SCENARIO, IN SOLA LETTURA (0.211.0).
//
// La natura si sceglie quando si crea lo scenario. Ripeterne i tre bottoni
// dentro la fase operativa significava due cose sbagliate: le stesse scelte
// fatte due volte, e il rischio di cambiare che cosa si sta valutando nel
// mezzo del lavoro. Qui la natura si legge — atto, origine, eventuale cambio
// con i passi da rivedere — e si cambia altrove, dalla pagina dedicata.
//
// Il componente è un Server Component: non ha comandi, non chiama azioni.

export function NaturaScenario({
  codice,
  scenarioId,
  situazione,
  origine,
  bloccato,
  cambiataIl,
  rivedere,
  vociCronologia,
}: {
  codice: string;
  scenarioId: number;
  situazione: TipoIstruttoria;
  origine: string;
  bloccato: boolean;
  cambiataIl?: string | null;
  rivedere?: string[];
  /** Quante voci ha la cronologia: serve solo a dire se c'è da leggere. */
  vociCronologia?: number;
}) {
  const base = `/spazio/${codice}/scenari/${scenarioId}`;
  const attuale = etichettaIstruttoria(situazione);
  const altre = (['PROPOSTA', 'DECRETO_LIQUIDAZIONE', 'CRAM_DOWN'] as TipoIstruttoria[]).filter(
    (t) => t !== situazione
  );

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 space-y-1.5 print:border-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Natura dello scenario
        </p>
        <Link
          href={`${base}/situazione`}
          className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800 print:hidden"
        >
          {vociCronologia && vociCronologia > 0 ? (
            <>
              <History className="w-3 h-3" /> Cronologia ({vociCronologia})
            </>
          ) : (
            'Cambia la natura'
          )}
        </Link>
      </div>
      <p className="text-[11px] text-slate-900">
        <span className="inline-flex items-center rounded-md border border-blue-400 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">
          {attuale}
        </span>
        <span className="text-[10px] text-slate-500">
          {' '}
          · origine: {origine}
          {bloccato ? ' · scenario in sola lettura' : ''}
        </span>
      </p>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Si sceglie alla creazione. La correzione — con il PIN del secondo fattore — sta fuori dalla
        fase operativa, nella pagina dedicata: così il lavoro dello scenario non cambia atto sotto
        mano
        {altre.length > 0
          ? ` (le altre nature restano ${altre.map(etichettaIstruttoria).join(' e ')})`
          : ''}
        .
      </p>
      {cambiataIl && (
        <div className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 leading-relaxed print:block">
          <span className="font-bold">Natura cambiata il {dataItaliana(cambiataIl)}.</span>{' '}
          {(rivedere ?? []).length > 0
            ? `Il lavoro fatto resta: rivedi ${(rivedere ?? []).join('; ')}.`
            : 'Nessun passo compilato da rivedere.'}
        </div>
      )}
    </div>
  );
}
