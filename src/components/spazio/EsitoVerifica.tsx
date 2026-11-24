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

import { Activity, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { SemaforoAttenzione } from './SemaforoAttenzione';
import { NOME_DIMENSIONE } from '@/lib/iai/dimensioni';
import { formattaEuro } from '@/lib/formato/numeri';
import type { EsitoVerifica as Esito } from '@/lib/verifica/esito';
import type { DebitoInBilancio } from '@/lib/verifica/debitoInBilancio';

// IL DEBITO VERSO L'ENTE, DENTRO LA SPIEGAZIONE (0.256.5).
//
// Le cinque dimensioni dicono da dove viene l'attenzione, ma non rispondono
// alla domanda che l'operatore si fa per prima: «questo debito, l'azienda l'ha
// scritto in bilancio?». Quando non c'è, la cifra accertata si mostra in un
// altro colore: il rosso non è un giudizio sull'azienda, è il segno che quella
// posta manca dal perimetro su cui sono calcolati patrimonio e indici.
function RigaDebitoInBilancio({ d }: { d: DebitoInBilancio }) {
  const tono =
    d.stato === 'NON_CONTABILIZZATO'
      ? {
          bordo: 'border-red-200',
          sfondo: 'bg-red-50',
          testo: 'text-red-900',
          importo: 'text-red-700',
        }
      : d.stato === 'CONTABILIZZATO' && !d.segnala
        ? {
            bordo: 'border-slate-200',
            sfondo: 'bg-slate-50',
            testo: 'text-slate-700',
            importo: 'text-slate-900',
          }
        : {
            bordo: 'border-amber-200',
            sfondo: 'bg-amber-50',
            testo: 'text-amber-900',
            importo: 'text-amber-800',
          };
  const titolo =
    d.stato === 'NON_CONTABILIZZATO'
      ? 'Debito verso l’ente non contabilizzato in bilancio'
      : d.stato === 'CONTABILIZZATO' && !d.segnala
        ? 'Debito verso l’ente contabilizzato in bilancio'
        : 'Debito verso l’ente: la verifica in bilancio non è possibile';
  const Icona =
    d.stato === 'NON_CONTABILIZZATO'
      ? AlertTriangle
      : d.stato === 'CONTABILIZZATO' && !d.segnala
        ? CheckCircle2
        : HelpCircle;

  return (
    <div className={`rounded-lg border p-3 ${tono.bordo} ${tono.sfondo}`}>
      <p className={`flex items-center gap-1.5 text-[11px] font-bold ${tono.testo}`}>
        <Icona className="h-3.5 w-3.5 shrink-0" /> {titolo}
      </p>
      <p className={`mt-1 text-[11px] leading-relaxed ${tono.testo}`}>{d.testo}</p>
      {d.esposizione !== null && (
        <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
          Debito accertato in amministrativa:{' '}
          <strong className={`tabular-nums ${tono.importo}`}>{formattaEuro(d.esposizione)}</strong>
          {d.inBilancio !== null && d.stato === 'CONTABILIZZATO' && (
            <>
              {' '}
              · in bilancio: <span className="tabular-nums">{formattaEuro(d.inBilancio)}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function EsitoVerifica({
  esito,
  debitoInBilancio,
}: {
  esito: Esito;
  debitoInBilancio?: DebitoInBilancio | null;
}) {
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

          {debitoInBilancio && <RigaDebitoInBilancio d={debitoInBilancio} />}

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
