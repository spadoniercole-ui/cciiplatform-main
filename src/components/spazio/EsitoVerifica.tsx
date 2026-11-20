// L'ESITO DELLA VERIFICA CONTABILE IN PAGINA — uno, con la sua spiegazione.
//
// Sopra: il semaforo, che è il giudizio (fatti accertati, dati mancanti,
// copertura). Sotto: le cinque dimensioni che dicono da dove viene
// l'attenzione. Le due cose stanno nella stessa scheda perché sono la stessa
// lettura: il numero che c'era prima (IAI 0-100, con la sua fascia) è stato
// tolto — diceva un'altra cosa sulla stessa posizione.
//
// Le barre non hanno soglie né colori di allarme: la loro lunghezza ordina i
// determinanti, non gradua un giudizio. Il giudizio è quello sopra.

import { Activity } from 'lucide-react';
import { SemaforoAttenzione } from './SemaforoAttenzione';
import { NOME_DIMENSIONE } from '@/lib/iai/dimensioni';
import type { EsitoVerifica as Esito } from '@/lib/verifica/esito';

export function EsitoVerifica({ esito }: { esito: Esito }) {
  return (
    <section className="space-y-3" aria-label="Esito della verifica contabile">
      <SemaforoAttenzione attenzione={esito.giudizio} />

      {esito.dimensioni.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
            <Activity className="w-4 h-4 text-blue-600 mt-0.5" />
            <div>
              <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Dove si concentra l’attenzione
              </h2>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Cinque dimensioni, con i loro determinanti e i dati che mancano. Non sono un
                punteggio complessivo e non cambiano l’esito qui sopra: lo spiegano.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {esito.dimensioni.map((c) => (
              <div key={c.dimensione} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-900">
                    {c.dimensione} · {NOME_DIMENSIONE[c.dimensione]}
                  </p>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    intensità {c.punteggio}
                  </span>
                </div>
                <div className="mt-1.5 h-2 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-2 rounded bg-blue-500/70"
                    style={{ width: `${c.punteggio}%` }}
                  />
                </div>
                {c.motivi.length > 0 && (
                  <ul className="list-disc pl-4 mt-2 space-y-0.5 text-[11px] text-slate-700">
                    {c.motivi.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
                {c.lacune.length > 0 && (
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-amber-800">
                    {c.lacune.map((l) => (
                      <li key={l}>lacuna: {l}</li>
                    ))}
                  </ul>
                )}
                {c.motivi.length === 0 && c.lacune.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-2">Nessun determinante.</p>
                )}
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed pt-2 border-t border-slate-100">
            Le dimensioni non si compensano fra loro né con l’esito: i presupposti di legge e il
            patrimonio netto negativo sono fatti, non pesi. Riferimenti normativi e metodo
            nell’allegato della stampa.
          </p>
        </div>
      )}
    </section>
  );
}
